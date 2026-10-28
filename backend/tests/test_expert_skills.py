"""Domain fixtures test arithmetic, comparability and teaching evidence failures."""
import copy
import unittest
import uuid
from types import SimpleNamespace

from app.api.item_help import validate_result as validate_learning
from app.core.exceptions import ValidationException
from app.engines.expert_skills import fitness_skill, learning_skill, load_skill, validate_teaching
from app.engines.fitness_expert import validate_result as validate_fitness

NOTES = '先主动回忆，再核对原文。'


def record(day, weight=20, sets=3, reps=8, *, name='深蹲', outcome='completed', exercises=None):
    return {'id': str(uuid.uuid4()), 'version': 2, 'content': {'occurred_on': day, 'outcome': outcome,
        'exercises': exercises if exercises is not None else [{'name': name, 'weight': weight, 'sets': sets, 'reps': reps}]}}


def source(kind, exercise='练习：描述步骤\n检查项 C1：说明先回忆再核对'):
    value = {'version': 3, 'fields': {'notes': NOTES, 'exercise': exercise}}
    return {**value, 'expert_skill': learning_skill(value, kind)}


def teaching(kind, answer='先主动回忆，再核对原文'):
    method = {'learning_explain': 'guided_explanation', 'learning_practice': 'retrieval_practice', 'learning_feedback': 'criterion_feedback'}[kind]
    return {'method': method, 'questions': ['如何用自己的话说明这两个步骤？'], 'criteria': [] if kind == 'learning_explain' else [
        {'id': 'C1', 'criterion': '说明先回忆再核对', 'source_quote': NOTES,
         'status': 'supported' if kind == 'learning_feedback' else 'target',
         'answer_quote': answer if kind == 'learning_feedback' else '', 'feedback': '对照原文核对顺序。'}],
        'hints': ['先想方向', '拆成两个步骤', '核对原文顺序'] if kind == 'learning_practice' else []}


class FitnessSkillTests(unittest.TestCase):
    def test_volume_reps_zero_weight_and_skip_are_distinct(self):
        rows = [record('2026-10-01'), record('2026-10-02', 0), record('2026-10-03', outcome='skipped'), record('2026-10-04', exercises=[])]
        result = fitness_skill({'records': rows})
        movement = result['tools']['training_volume']['movements'][0]
        self.assertEqual((movement['recorded_sets'], movement['recorded_reps'], movement['external_volume_kg_reps']), (6, 48, 480))
        self.assertEqual(result['tools']['record_comparison']['recorded_days'], ['2026-10-01', '2026-10-02', '2026-10-04'])
        self.assertEqual(result['tools']['training_volume']['missing_details'][0]['id'], rows[3]['id'])
        self.assertEqual(len(result['tools']['training_volume']['zero_external_load_records']), 1)

    def test_changed_sets_and_reps_are_not_comparable_and_names_remain_separate(self):
        rows = [record('2026-10-01'), record('2026-10-02', 25, reps=5), record('2026-10-03', 30, sets=4),
                record('2026-10-04', 25), record('2026-10-05', 40, name='杠铃深蹲')]
        result = fitness_skill({'records': rows})
        comparison = next(m for m in result['tools']['training_volume']['movements'] if m['name'] == '深蹲')['comparisons']
        self.assertEqual(len(comparison), 1)
        self.assertEqual((comparison[0]['days_between'], comparison[0]['weight_change_kg']), (3, 5))
        self.assertEqual((comparison[0]['previous']['id'], comparison[0]['current']['id']), (rows[0]['id'], rows[3]['id']))
        self.assertEqual(comparison[0]['previous']['version'], 2)

    def test_same_day_and_mixed_entries_cannot_be_selected_as_convenient_max(self):
        result = fitness_skill({'records': [record('2026-10-01'), record('2026-10-01', 35), record('2026-10-02', 30)]})
        self.assertEqual(result['tools']['record_comparison']['comparison_count'], 0)

    def test_server_execution_receipt_cannot_be_fabricated_by_model(self):
        row = record('2026-10-01'); base = {'records': [row]}; base['expert_skill'] = fitness_skill(base)
        raw = {'observations': [{'text': '记录有 3 组。', 'record_ids': [row['id']]}], 'limitation': '不能判断力量变化。',
               'suggestion': {'title': '核对记录', 'detail': '核对动作器械。', 'record_ids': [row['id']]}}
        self.assertEqual(validate_fitness(raw, base)['skill'], base['expert_skill'])
        with self.assertRaises(ValueError): validate_fitness({**raw, 'skill': {'name': '假装专家'}}, base)

    def test_large_tool_output_requires_smaller_range_instead_of_truncating(self):
        with self.assertRaises(ValidationException):
            fitness_skill({'records': [record(f'2026-10-{i % 28 + 1:02}', name='动作' * 100) for i in range(300)]})


class LearningSkillTests(unittest.TestCase):
    def test_practice_has_three_progressive_hints_and_no_answer_evaluation(self):
        s = source('learning_practice'); raw = teaching('learning_practice')
        self.assertEqual(validate_teaching(raw, s, 'learning_practice', '')['method'], 'retrieval_practice')
        for patch in ({'hints': ['直接给答案']}, {'method': 'criterion_feedback'}, {'questions': [' ']}):
            with self.assertRaises(ValueError): validate_teaching({**raw, **patch}, s, 'learning_practice', '')
        raw['criteria'][0]['status'] = 'supported'
        with self.assertRaises(ValueError): validate_teaching(raw, s, 'learning_practice', '')

    def test_feedback_must_keep_saved_rubric_and_cite_actual_answer(self):
        s = source('learning_feedback'); raw = teaching('learning_feedback')
        self.assertEqual(validate_teaching(raw, s, 'learning_feedback', '先主动回忆，再核对原文')['criteria'][0]['status'], 'supported')
        for field, value in [('criterion', '临时换一个标准'), ('source_quote', '从来没有的原文'), ('answer_quote', '编造的正确答案')]:
            bad = copy.deepcopy(raw); bad['criteria'][0][field] = value
            with self.assertRaises(ValueError): validate_teaching(bad, s, 'learning_feedback', '先主动回忆，再核对原文')
        with self.assertRaises(ValueError): validate_teaching({**raw, 'criteria': []}, s, 'learning_feedback', '先主动回忆，再核对原文')

    def test_uncertainty_and_missing_do_not_force_a_score_or_invent_an_answer(self):
        s = source('learning_feedback'); raw = teaching('learning_feedback')
        for status in ['missing', 'uncertain']:
            raw['criteria'][0].update(status=status, answer_quote='')
            self.assertEqual(validate_teaching(raw, s, 'learning_feedback', '还不确定')['criteria'][0]['status'], status)
        raw['criteria'][0].update(status='supported', answer_quote='')
        with self.assertRaises(ValueError): validate_teaching(raw, s, 'learning_feedback', '还不确定')
        raw['criteria'][0].update(status='needs_revision', answer_quote='先抄原文')
        self.assertEqual(validate_teaching(raw, s, 'learning_feedback', '先抄原文')['criteria'][0]['status'], 'needs_revision')
        raw['criteria'][0]['answer_quote'] = ''
        with self.assertRaises(ValueError): validate_teaching(raw, s, 'learning_feedback', '先抄原文')

    def test_manual_exercise_is_preserved_and_malformed_or_duplicate_rubric_is_blocked(self):
        s = source('learning_feedback', '请说明如何应用这段材料')
        self.assertEqual(s['expert_skill']['tools']['saved_rubric'], [{'id': 'C1', 'criterion': '请说明如何应用这段材料'}])
        for exercise in ['检查项 C1：甲\n检查项 C1：乙', '检查项 C5：甲', '检查项 C1：']:
            with self.assertRaises(ValueError): source('learning_feedback', exercise)

    def test_explanation_requires_guided_questions_and_no_unsubmitted_score(self):
        s = source('learning_explain'); raw = teaching('learning_explain')
        self.assertEqual(validate_teaching(raw, s, 'learning_explain', '')['criteria'], [])
        raw['criteria'] = teaching('learning_practice')['criteria']
        with self.assertRaises(ValueError): validate_teaching(raw, s, 'learning_explain', '')

    def test_repeated_adoptions_keep_history_but_feedback_uses_latest_exercise(self):
        old = '【当前练习】\n旧练习\n检查项 C1：旧标准\n【练习结束】'
        new = '【当前练习】\n新练习\n检查项 C1：新标准\n【练习结束】'
        s = source('learning_feedback', old + '\n\n' + new)
        self.assertEqual(s['expert_skill']['tools']['saved_rubric'], [{'id':'C1','criterion':'新标准'}])
        self.assertIn('旧标准', s['fields']['exercise'])
        with self.assertRaises(ValueError): source('learning_feedback', old + '\n【当前练习】\n损坏练习')

    def test_new_learning_execution_rejects_role_only_reply_and_model_metadata(self):
        req = SimpleNamespace(kind='learning_practice', answer='')
        s = source(req.kind); raw = {'text': '合上资料描述步骤。', 'quotes': [NOTES], 'teaching': teaching(req.kind)}
        self.assertEqual(validate_learning(raw, req, s)['skill']['id'], 'source-grounded-learning')
        for bad in [{'text': '泛泛而谈', 'quotes': [NOTES]}, {**raw, 'skill': {'name': '冒充专业'}},
                    {**raw, 'text': '检查项 C1：重复标准'}]:
            with self.assertRaises(ValueError): validate_learning(bad, req, s)

    def test_pack_is_independent_of_user_content_and_has_a_reproducible_version(self):
        a = load_skill('learning-tutor'); a['sources'].clear()
        b = load_skill('learning-tutor'); self.assertEqual(len(b['sources']), 2)
        self.assertEqual(len(b['manifest_digest']), 64)
        with self.assertRaises(ValueError): load_skill('../private')

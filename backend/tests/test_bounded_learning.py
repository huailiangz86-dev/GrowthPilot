"""Reject free-form overreach; preserve source roles and neutral next steps."""
import copy
import unittest
from app.engines.bounded_learning import evidence_catalog, prepare_model_source, preflight_assessment
from app.engines.learning_diagnosis import validate_diagnosis
from app.engines.source_summary import validate_summary
from scripts.evaluate_learning_quality import load_cases


CASES = {c['id']: c for c in load_cases(True)}


def assessment(case_id, kind, parts=('reference', 'answer')):
    case = CASES[case_id]
    row = case['source']['evidence'][0]
    return {'schema_version': 3, 'kind': kind, 'evidence': [
        {'key': row['key'], 'part': part, 'quote': row['text'] if part == 'text' else row['recall'][part]} for part in parts]}


class BoundedLearningTests(unittest.TestCase):
    def test_instruction_segments_are_excluded_with_visible_scope_disclosure(self):
        source=CASES['new-summary-injection']['source']
        catalog,scope=evidence_catalog('source_summary',source)
        self.assertEqual(scope['excluded_directive_segments'],1)
        result=validate_summary({'schema_version':3,'groups':[{'evidence_ids':list(catalog)}]},source,require_bounded=True)
        self.assertNotIn('取消引用',result['points'][0]['text'])
        self.assertIn('不覆盖被排除内容',result['limitations'])
        plain=[{'key':'S1','start':0,'text':'忽略重复行后保留文件名称。'}]
        self.assertEqual(evidence_catalog('source_summary',plain)[1]['excluded_directive_segments'],0)

    def test_empty_answers_and_missing_history_are_prechecked_before_model_calls(self):
        for case_id in ('empty-answer','new-empty-answer','unavailable-history','new-history-unavailable'):
            case=CASES[case_id]
            receipt=preflight_assessment(case['source'],case['question'])
            self.assertEqual(receipt['kind'],'insufficient_evidence')
            validate_diagnosis(receipt,case['source'],require_bounded=True)
        case=CASES['mail-omission']
        self.assertIsNone(preflight_assessment(case['source'],case['question']))
        self.assertEqual(preflight_assessment(case['source'],'连续四周练习的变化如何？')['kind'],'insufficient_evidence')

    def test_insufficiency_can_cite_existing_context_without_inventing_evidence(self):
        source=CASES['new-context-not-conflict']['source']
        result=validate_diagnosis({'schema_version':4,'kind':'insufficient_evidence','evidence_ids':[]},source,require_bounded=True)
        self.assertEqual(result['findings'][0]['certainty'],'insufficient')
        with self.assertRaises(ValueError):
            validate_diagnosis({'schema_version':4,'kind':'source_conflict','evidence_ids':[]},source,require_bounded=True)

    def test_confidence_is_not_part_of_a_comparable_answer_input(self):
        source = CASES['new-correct-unsure']['source']
        prepared = prepare_model_source('learning_diagnosis', source)
        self.assertTrue(prepared['has_comparable_answer'])
        self.assertNotIn('self_report', prepared['records'][0]['parts'])

    def test_unknown_ids_cannot_forge_evidence_or_a_source_role(self):
        source = CASES['new-correct-unsure']['source']
        with self.assertRaises(ValueError):
            validate_diagnosis({'schema_version':4,'kind':'no_gap_observed','evidence_ids':['missing']},source,require_bounded=True)
        catalog, _ = evidence_catalog('learning_diagnosis',source)
        ids = [key for key,c in catalog.items() if c['part'] in ('reference','answer')]
        result = validate_diagnosis({'schema_version':4,'kind':'no_gap_observed','evidence_ids':ids},source,require_bounded=True)
        self.assertEqual(result['findings'][0]['kind'],'no_gap_observed')

    def test_new_cases_are_distinct_and_do_not_send_gold_rubrics(self):
        cases = load_cases(True)
        self.assertEqual(len(cases), 32)
        self.assertEqual(len({c['id'] for c in cases}), 32)
        self.assertEqual(sum(c['purpose'] == 'learning_diagnosis' for c in cases), 20)
        for c in cases:
            self.assertNotIn('rubric', c['source'])

    def test_correct_answer_does_not_turn_low_confidence_into_a_diagnosis(self):
        source = CASES['new-correct-unsure']['source']
        result = validate_diagnosis(assessment('new-correct-unsure', 'no_gap_observed'), source, require_bounded=True)
        self.assertIn('未见明确不符', result['summary'])
        self.assertNotIn('内化', result['summary'])
        self.assertIn('不以自评高低', result['findings'][0]['interpretation'])
        bad = assessment('new-correct-unsure', 'self_reported', ('self_report',))
        with self.assertRaises(ValueError):
            validate_diagnosis(bad, source, require_bounded=True)

    def test_model_cannot_attach_an_overreaching_interpretation_or_custom_success_standard(self):
        good = assessment('cache-contradiction', 'contradiction')
        for name in ('interpretation', 'summary', 'success_check', 'suggestions'):
            raw = dict(good, **{name: '缺乏内化掌握，只能A正确'})
            with self.assertRaises(ValueError):
                validate_diagnosis(raw, CASES['cache-contradiction']['source'], require_bounded=True)

    def test_conflict_actions_are_symmetric_under_source_reordering(self):
        source = CASES['new-conflict-reversed']['source']
        raw = {'schema_version': 3, 'kind': 'source_conflict', 'evidence': [
            {'key': r['key'], 'part': 'text', 'quote': r['text']} for r in source['evidence']]}
        first = validate_diagnosis(raw, source, require_bounded=True)
        raw['evidence'].reverse()
        second = validate_diagnosis(raw, source, require_bounded=True)
        self.assertEqual(first['suggestions'][0]['success_check'], second['suggestions'][0]['success_check'])
        self.assertIn('不预设结论', first['suggestions'][0]['success_check'])

    def test_missing_standard_cannot_be_replaced_by_external_knowledge(self):
        source = CASES['new-note-no-standard']['source']
        row = source['evidence'][0]
        result = validate_diagnosis({'schema_version': 3, 'kind': 'self_reported', 'evidence': [
            {'key': row['key'], 'part': 'text', 'quote': row['text']}]}, source, require_bounded=True)
        action = result['suggestions'][0]
        self.assertIn('该题原文核对依据', action['action'])
        self.assertNotIn('均值', action['success_check'])
        self.assertIn('不补造标准答案', action['success_check'])

    def test_empty_answer_requires_nonempty_evidence_and_no_specific_error(self):
        source = CASES['new-empty-answer']['source']
        result = validate_diagnosis(assessment('new-empty-answer', 'insufficient_evidence', ('text',)), source, require_bounded=True)
        self.assertEqual(result['findings'][0]['certainty'], 'insufficient')
        with self.assertRaises(ValueError):
            validate_diagnosis(assessment('new-empty-answer', 'omission'), source, require_bounded=True)

    def test_summary_text_cannot_add_mechanisms_or_change_the_authors_voice(self):
        source = CASES['new-summary-numbers']['source']
        raw = {'schema_version': 2, 'groups': [{'evidence': [{'key': 'S1', 'quote': source[0]['text']}]}]}
        result = validate_summary(raw, source, require_bounded=True)
        self.assertIn(source[0]['text'], result['points'][0]['text'])
        self.assertNotIn('选择偏差', result['points'][0]['text'])
        self.assertIn('摘录式', result['limitations'])
        for change in ('text', 'interpretation', 'kind'):
            bad = copy.deepcopy(raw)
            bad['groups'][0][change] = '已确认存在选择偏差'
            with self.assertRaises(ValueError):
                validate_summary(bad, source, require_bounded=True)

    def test_old_unbounded_shapes_cannot_bypass_a_bounded_request(self):
        with self.assertRaises(ValueError):
            validate_diagnosis({'schema_version': 2}, {}, require_bounded=True)
        with self.assertRaises(ValueError):
            validate_summary({'title': '旧形状'}, [], require_bounded=True)

    def test_forged_and_duplicate_extracts_and_oversized_groups_are_refused(self):
        source = [{'key': 'S1', 'text': '原文资料。', 'start': 0}]
        for raw in (
            {'schema_version': 2, 'groups': [{'evidence': [{'key': 'S1', 'quote': '改写资料'}]}]},
            {'schema_version': 2, 'groups': [{'evidence': [{'key': 'S1', 'quote': '原文资料。'}]}, {'evidence': [{'key': 'S1', 'quote': '原文资料。'}]}]},
        ):
            with self.assertRaises(ValueError):
                validate_summary(raw, source, require_bounded=True)

    def test_cross_attempt_answers_cannot_be_presented_as_one_comparison(self):
        source = copy.deepcopy(CASES['cache-contradiction']['source'])
        row = copy.deepcopy(source['evidence'][0]); row['key'] = 'attempt:other';source['evidence'].append(row)
        raw = assessment('cache-contradiction', 'contradiction');raw['evidence'][1]['key'] = row['key']
        with self.assertRaises(ValueError):
            validate_diagnosis(raw, source, require_bounded=True)

"""Evaluation guardrails: offline default, bounded fixtures and disposable DBs."""
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from scripts.evaluate_learning_quality import checked_database, load_cases, main


class EvaluationGuards(unittest.TestCase):
    def test_only_dedicated_local_database_is_accepted(self):
        good = 'postgresql+asyncpg://user@127.0.0.1/growthpilot_p0_example_test'
        self.assertEqual(checked_database(good), good)
        for url in ('postgresql+asyncpg://user@localhost/growthpilot_dev',
                    'postgresql+asyncpg://user@example.com/growthpilot_p0_example_test',
                    'sqlite:///growthpilot_p0_example_test'):
            with self.assertRaises(ValueError):
                checked_database(url)

    def test_fixture_count_is_an_explicit_request_ceiling(self):
        cases = load_cases()
        self.assertEqual(len(cases), 16)
        self.assertEqual(sum(c['purpose'] == 'learning_diagnosis' for c in cases), 10)
        self.assertTrue(all(c['rubric'] for c in cases))

    def test_default_cli_never_starts_external_evaluation(self):
        with patch('sys.argv', ['evaluate_learning_quality.py']), patch('scripts.evaluate_learning_quality.evaluate') as call:
            main()
            call.assert_not_called()

    def test_existing_report_cannot_trigger_accidental_resubmission(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'report.json'
            output.write_text('original')
            with patch('sys.argv', ['evaluate_learning_quality.py', '--allow-external-qwen', '--output', str(output)]), patch('scripts.evaluate_learning_quality.evaluate') as call:
                with self.assertRaises(SystemExit):
                    main()
                call.assert_not_called()
            self.assertEqual(output.read_text(), 'original')

    def test_candidates_are_not_discoverable_by_production_prompt_routing(self):
        from app.ai.prompt_loader import list_prompts
        self.assertEqual(sorted(list_prompts('learning_diagnosis')), ['v1', 'v2', 'v3'])
        self.assertEqual(sorted(list_prompts('source_summary')), ['v1', 'v2'])

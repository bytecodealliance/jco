"""ABI sensitivity controls for the pinned fixture refresh's printed-WIT comparison.

Run with: python3 -m unittest discover -s scripts/fixtures/p3_sdk -p 'test_*.py'
"""
import unittest

from wit_surface import normalize_wit


class WitSurfaceTests(unittest.TestCase):
    def test_named_declarations_and_use_members_are_unordered(self):
        first = '''package example:test;
            interface types { record pair { first: u32, second: string, } type other = u64; }
            interface api {
                use types.{pair, other};
                first: func(value: pair) -> u32;
                second: func() -> string;
            }
            world test { import api; export run: func(); }
        '''
        second = '''package example:test;
            world test { export run: func(); import api; }
            interface api {
                second: func() -> string;
                first: func(value: pair) -> u32;
                use types.{other, pair};
            }
            interface types { type other = u64; record pair { first: u32, second: string, } }
        '''
        self.assertEqual(normalize_wit(first), normalize_wit(second))

    def test_ordered_type_members_remain_distinct(self):
        cases = [
            ('record', 'record value { first: u32, second: string, }',
             'record value { second: string, first: u32, }'),
            ('variant', 'variant value { first(u32), second(string), }',
             'variant value { second(string), first(u32), }'),
            ('enum', 'enum value { first, second, }', 'enum value { second, first, }'),
            ('flags', 'flags value { first, second, }', 'flags value { second, first, }'),
            ('tuple', 'type value = tuple<u32, string>;', 'type value = tuple<string, u32>;'),
        ]
        for name, first, second in cases:
            with self.subTest(name=name):
                self.assertNotEqual(
                    normalize_wit('interface api { ' + first + ' }'),
                    normalize_wit('interface api { ' + second + ' }'),
                )

    def test_function_signatures_and_resource_ownership_remain_distinct(self):
        cases = [
            ('parameter order', 'f: func(first: u32, second: string);',
             'f: func(second: string, first: u32);'),
            ('parameter type', 'f: func(value: u32);', 'f: func(value: s32);'),
            ('result type', 'f: func() -> u32;', 'f: func() -> s32;'),
            ('async', 'f: func();', 'f: async func();'),
            ('ownership', 'resource r; f: func(value: own<r>);',
             'resource r; f: func(value: borrow<r>);'),
            ('resource method kind', 'resource r { f: func(); }',
             'resource r { f: static func(); }'),
        ]
        for name, first, second in cases:
            with self.subTest(name=name):
                self.assertNotEqual(
                    normalize_wit('interface api { ' + first + ' }'),
                    normalize_wit('interface api { ' + second + ' }'),
                )

    def test_world_import_export_identity_and_package_versions_remain_distinct(self):
        self.assertNotEqual(
            normalize_wit('world test { import run: func(); }'),
            normalize_wit('world test { export run: func(); }'),
        )
        self.assertNotEqual(
            normalize_wit('world test { import example:api/run@1.0.0; }'),
            normalize_wit('world test { import example:api/run@2.0.0; }'),
        )
        self.assertNotEqual(
            normalize_wit('world test { import first: func(); }'),
            normalize_wit('world test { import second: func(); }'),
        )

    def test_incomplete_printed_wit_is_rejected(self):
        for text in ['interface api { f: func();', 'world test { } trailing']:
            with self.subTest(text=text):
                with self.assertRaises(AssertionError):
                    normalize_wit(text)


if __name__ == '__main__':
    unittest.main()

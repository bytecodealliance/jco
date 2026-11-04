"""Compare printed WIT while preserving ordered ABI members and ignoring declaration order."""
import re


def split_items(text):
    items = []
    start = 0
    depth = 0
    for i, ch in enumerate(text):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                # A use declaration's closing brace is followed by a semicolon.
                if end < len(text) and text[end] == ';':
                    continue
                if text[start:end].strip():
                    items.append(text[start:end].strip())
                start = end
        elif ch == ';' and depth == 0:
            if text[start:i + 1].strip():
                items.append(text[start:i + 1].strip())
            start = i + 1
    assert depth == 0, 'unbalanced printed WIT'
    assert not text[start:].strip(), repr(text[start:])
    return items


def normalize_wit(text):
    def normalize(item):
        # Only declaration containers are unordered. Record fields, tuple
        # elements, variant/enum cases and function parameters keep their order.
        if re.match(r'^(?:package|world|interface)\s', item) and '{' in item:
            begin = item.index('{')
            end = item.rindex('}')
            header = re.sub(r'\s+', ' ', item[:begin].strip())
            body = sorted(normalize(child) for child in split_items(item[begin + 1:end]))
            return header + '{' + '\n'.join(body) + '}'
        if item.startswith('use ') and '{' in item:
            begin = item.index('{')
            end = item.rindex('}')
            names = sorted(name.strip() for name in item[begin + 1:end].split(',') if name.strip())
            item = item[:begin + 1] + ','.join(names) + item[end:]
        return re.sub(r'\s+', ' ', item.strip())
    return '\n'.join(sorted(normalize(item) for item in split_items(text)))

import re

with open('src/features/doctor-dashboard/EnrollPrescribeModal.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.DOTALL)
text = re.sub(r'//.*', '', text)
text = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "''", text)
text = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', '""', text)
text = re.sub(r"`[^`\\]*(?:\\.[^`\\]*)*`", "``", text)

def find_extra():
    tags = []
    lines = text.split('\n')
    for i, line in enumerate(lines):
        for m in re.finditer(r'</?([a-zA-Z0-9_]+)[^>]*>', line):
            full = m.group(0)
            tag = m.group(1)
            if full.endswith('/>') or tag.lower() in ['input', 'img', 'br', 'hr']:
                continue
            if full.startswith('</'):
                if not tags: 
                   print(f'Extra </{tag}> at line {i+1}')
                   return
                elif tags[-1][0] != tag: 
                   print(f'Mismatched </{tag}> at line {i+1}, expected {tags[-1][0]} from {tags[-1][1]}')
                   return
                else: 
                   tags.pop()
            else:
                tags.append((tag, i+1))
    print('Remaining tags:', tags)

find_extra()

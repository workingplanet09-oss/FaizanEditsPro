"""Tiny reader/writer for the INSERT blocks in database.sql / database-demo.sql (the exact format pg-to-mysql.mjs writes):

    INSERT INTO `t` (`a`, `b`) VALUES
    (v, v),
    (v, v);

Values are NULL, bare numbers, or 'quoted text' with \\\\ and '' escapes. `edit_table` parses one table's rows into dicts, lets a function
change them, and writes the block back in the same shape, so content in the shipped SQL can be revised without a database round trip.
Developer tool only (used by rebrand-bootstrap.py)."""
import re


_UNESC = {"0": "\0", "n": "\n", "r": "\r", "Z": "\x1a", "\\": "\\", "'": "'", '"': '"'}
_ESC = {"\0": "\\0", "\n": "\\n", "\r": "\\r", "\\": "\\\\", "'": "\\'", '"': '\\"', "\x1a": "\\Z"}


class Raw(str):
    """a value written exactly as given (numbers, NULL)"""


def _tokens(body):
    """yield rows (lists of python values) from the text after VALUES"""
    i, n = 0, len(body)
    rows = []
    while i < n:
        while i < n and body[i] in " \r\n,":
            i += 1
        if i >= n or body[i] == ";":
            break
        assert body[i] == "(", body[i:i + 40]
        i += 1
        row = []
        while True:
            while body[i] in " \r\n":
                i += 1
            if body[i] == "'":
                j = i + 1
                buf = []
                while True:
                    c = body[j]
                    if c == "\\":
                        buf.append(_UNESC.get(body[j + 1], body[j + 1]))
                        j += 2
                    elif c == "'":
                        if body[j + 1] == "'":
                            buf.append("'")
                            j += 2
                        else:
                            j += 1
                            break
                    else:
                        buf.append(c)
                        j += 1
                row.append("".join(buf))
                i = j
            else:
                j = i
                while body[j] not in ",)":
                    j += 1
                row.append(Raw(body[i:j].strip()))
                i = j
            while body[i] in " \r\n":
                i += 1
            if body[i] == ",":
                i += 1
                continue
            assert body[i] == ")"
            i += 1
            break
        rows.append(row)
    return rows


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, Raw):
        return str(v)
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + re.sub("[\0\n\r\\\\'\"\x1a]", lambda m: _ESC[m.group(0)], str(v)) + "'"


def block_re(table):
    return re.compile(r"INSERT INTO `%s` \((?P<cols>[^)]*)\) VALUES\n(?P<body>.*?);\n" % re.escape(table), re.S)


def edit_table(text, table, fn, comment=True):
    m = block_re(table).search(text)
    assert m, "no INSERT block for " + table
    cols = [c.strip("` ") for c in m.group("cols").split(",")]
    orig = [dict(zip(cols, r)) for r in _tokens(m.group("body"))]
    rows = fn([dict(r) for r in orig])
    # str methods on a Raw cell (NULL, numbers) return a plain str, which would then be written quoted ('NULL'):
    # a cell whose text did not change keeps its original, unquoted form
    for r, o in zip(rows, orig):
        for k, ov in o.items():
            if isinstance(ov, Raw) and k in r and not isinstance(r[k], Raw) and r[k] == str(ov):
                r[k] = ov
    out = "INSERT INTO `%s` (%s) VALUES\n%s;\n" % (
        table, m.group("cols"),
        ",\n".join("(" + ", ".join(lit(r.get(c)) if c in r else "NULL" for c in cols) + ")" for r in rows),
    )
    text = text[: m.start()] + out + text[m.end():]
    if comment:
        text = re.sub(r"(-- %s: )\d+( row\(s\))" % re.escape(table), lambda mm: "%s%d%s" % (mm.group(1), len(rows), mm.group(2)), text, count=1)
    return text


def val(v):
    """python value of a parsed cell (Raw → int/None)"""
    if isinstance(v, Raw):
        return None if v == "NULL" else int(v) if re.fullmatch(r"-?\d+", v) else float(v)
    return v

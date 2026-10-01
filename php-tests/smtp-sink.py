#!/usr/bin/env python3
"""A tiny SMTP server for tests: accepts any message (AUTH LOGIN user/pass checked), appends the raw messages to a file, logs commands.
   python3 php-tests/smtp-sink.py PORT OUTFILE [USER PASS]"""
import socket, sys, base64, json
port, out = int(sys.argv[1]), sys.argv[2]
user = sys.argv[3] if len(sys.argv) > 3 else None
pw = sys.argv[4] if len(sys.argv) > 4 else None
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", port)); s.listen(5)
def serve(c):
    f = c.makefile("rwb", buffering=0)
    def w(x): f.write((x + "\r\n").encode())
    w("220 sink ESMTP"); log = []; rcpts = []; sender = None; authed = user is None
    while True:
        line = f.readline()
        if not line: break
        cmd = line.decode("utf-8", "replace").rstrip("\r\n"); log.append(cmd[:200] if not cmd.startswith(("AUTH", )) else cmd)
        u = cmd.upper()
        if u.startswith("EHLO"): w("250-sink"); w("250 AUTH LOGIN")
        elif u.startswith("AUTH LOGIN"):
            w("334 VXNlcm5hbWU6"); gu = base64.b64decode(f.readline().strip()).decode(); w("334 UGFzc3dvcmQ6"); gp = base64.b64decode(f.readline().strip()).decode()
            if gu == user and gp == pw: authed = True; w("235 ok")
            else: w("535 5.7.8 authentication failed")
        elif u.startswith("MAIL FROM"):
            if not authed: w("530 auth required"); continue
            sender = cmd[10:]; w("250 ok")
        elif u.startswith("RCPT TO"): rcpts.append(cmd[8:]); w("250 ok")
        elif u == "DATA":
            w("354 go"); data = b""
            while True:
                l = f.readline()
                if l in (b".\r\n", b""): break
                data += l[1:] if l.startswith(b"..") else l
            with open(out, "a") as o: o.write(json.dumps({"from": sender, "rcpt": rcpts, "log": log, "data": data.decode("utf-8", "replace")}) + "\n")
            w("250 queued"); rcpts = []
        elif u == "QUIT": w("221 bye"); break
        else: w("250 ok")
    c.close()
while True:
    c, _ = s.accept()
    try: serve(c)
    except Exception as e: sys.stderr.write("sink: %r\n" % (e,)); c.close()

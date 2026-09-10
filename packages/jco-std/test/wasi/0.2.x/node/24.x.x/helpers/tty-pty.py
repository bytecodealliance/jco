"""Run a command on a pseudo-terminal of a fixed size with scripted interaction.

usage: tty-pty.py ROWS COLS STEPS COMMAND...

STEPS is a JSON list of {"expect": text} (wait until the output so far contains text) and
{"send": text} (write text to the terminal). The result is a JSON object on stdout with the
terminal output and the command's exit status.
"""
import json
import os
import pty
import sys

rows, cols = int(sys.argv[1]), int(sys.argv[2])
steps = json.loads(sys.argv[3])
command = sys.argv[4:]

master, slave = pty.openpty()
import fcntl, struct, termios  # noqa: E401

fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

pid = os.fork()
if pid == 0:
    os.close(master)
    os.login_tty(slave)
    os.execvp(command[0], command)

os.close(slave)
output = b""


def read_more():
    global output
    try:
        chunk = os.read(master, 65536)
    except OSError:
        return False
    if not chunk:
        return False
    output += chunk
    return True


for step in steps:
    if "expect" in step:
        while step["expect"].encode() not in output:
            if not read_more():
                break
    elif "send" in step:
        os.write(master, step["send"].encode())

while read_more():
    pass

_, status = os.waitpid(pid, 0)
sys.stdout.write(
    json.dumps({"output": output.decode("utf-8", "replace"), "status": os.waitstatus_to_exitcode(status)})
)

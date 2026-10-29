import threading
import time
from collections.abc import Callable

import wit


class Threads:
    """Propagate worker failures to the exported call; join every worker."""

    def __init__(self) -> None:
        self.workers: list[threading.Thread] = []
        self.errors: list[BaseException] = []

    def start(self, target: Callable[[], None]) -> None:
        def checked() -> None:
            try:
                target()
            except BaseException as error:
                self.errors.append(error)

        worker = threading.Thread(target=checked)
        self.workers.append(worker)
        worker.start()

    def join(self) -> None:
        for worker in self.workers:
            worker.join()
            assert not worker.is_alive()
        if self.errors:
            raise self.errors[0]


def start_join() -> list[str]:
    # Adapted from componentize-py PR #242, examples/multithreading/app.py:
    # https://github.com/bytecodealliance/componentize-py/blob/e520f231f761d771f30224096e4f972fcaaa9c62/examples/multithreading/app.py
    # Return a trace instead of printing, and shorten the sleep. The host checks
    # per-thread ordering without depending on the ordering of timer wakeups.
    trace: list[str] = []
    threads = Threads()

    def work(name: str) -> None:
        trace.append(f"{name}:started")
        time.sleep(0.01)
        trace.append(f"{name}:finished")

    for name in ("a", "b", "c"):
        threads.start(lambda name=name: work(name))
    trace.append("main:started-all")
    threads.join()
    trace.append("main:joined-all")
    return trace


def lock_handoff() -> list[str]:
    trace: list[str] = []
    lock = threading.Lock()
    ready = threading.Event()
    threads = Threads()

    def work() -> None:
        trace.append("worker:waiting")
        ready.set()
        with lock:
            trace.append("worker:acquired")

    with lock:
        threads.start(work)
        ready.wait()
        trace.append("main:releasing")
    threads.join()
    trace.append("main:joined")
    return trace


def condition_notify() -> list[str]:
    trace: list[str] = []
    condition = threading.Condition()
    ready = threading.Event()
    values: list[str] = []
    threads = Threads()

    def work() -> None:
        with condition:
            trace.append("worker:waiting")
            ready.set()
            condition.wait_for(lambda: bool(values))
            trace.append(f"worker:received:{values.pop()}")

    threads.start(work)
    ready.wait()
    with condition:
        values.append("hello")
        trace.append("main:notifying")
        condition.notify()
    threads.join()
    trace.append("main:joined")
    return trace


def thread_local() -> list[str]:
    local = threading.local()
    local.value = "main"
    barrier = threading.Barrier(3)
    results: list[str] = []
    identities: list[int] = []
    threads = Threads()

    def work(name: str) -> None:
        assert not hasattr(local, "value")
        local.value = name
        identities.append(threading.get_ident())
        # Every worker must store its value before anyone reads it back. Shared
        # storage masquerading as TLS would therefore fail this assertion.
        barrier.wait()
        assert local.value == name
        results.append(local.value)

    for name in ("a", "b", "c"):
        threads.start(lambda name=name: work(name))
    threads.join()
    assert len(set(identities + [threading.get_ident()])) == 4
    assert local.value == "main"
    return [local.value, *sorted(results)]


CASES = {
    "start-join": start_join,
    "lock-handoff": lock_handoff,
    "condition-notify": condition_notify,
    "thread-local": thread_local,
}


@wit.guest
class Component(wit.WorldExports):
    async def run(self, test_case: str) -> list[str]:
        return CASES[test_case]()

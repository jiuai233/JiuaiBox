import functools


def plain(a, b):
    return a + b


class Greeter:
    """Says hello."""

    def __init__(self, name):
        self.name = name

    @functools.lru_cache(maxsize=None)
    def greet(self):
        return f"hello {self.name}"


@functools.cache
def cached():
    return 1

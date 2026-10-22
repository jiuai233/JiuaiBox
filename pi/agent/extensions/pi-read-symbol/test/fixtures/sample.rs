use std::fmt;

/// A point.
#[derive(Debug, Clone)]
pub struct Point {
    x: i32,
}

impl Point {
    pub fn new(x: i32) -> Self {
        Point { x }
    }

    fn matched(&self) -> bool {
        self.x > 0
    }
}

struct Other;

impl Other {
    fn matched(&self) -> bool {
        false
    }
}

impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.x)
    }
}

pub fn top_level() -> usize {
    let helper = 1;
    helper + 1
}

trait Draw {
    fn draw(&self);
}

struct Foo;

impl &Foo {
    fn method(&self) -> bool {
        true
    }
}

impl &mut Foo {
    fn method_mut(&mut self) -> bool {
        true
    }
}

package sample

type Counter struct {
	n int
}

func (c *Counter) Inc() {
	c.n++
}

func New() *Counter {
	return &Counter{}
}

func (c *other.Box) Inc() {
	c.n++
}

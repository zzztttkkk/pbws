export class Node<T> {
	val: T;
	prev?: Node<T>;
	next?: Node<T>;

	constructor(v: T) {
		this.val = v;
	}
}

export class List<T> {
	protected _head?: Node<T>;
	protected _tail?: Node<T>;
	protected _size = 0;

	get size(): number {
		return this._size;
	}

	empty(): boolean {
		return this._size === 0;
	}

	mknode(v: T): Node<T> {
		return new Node(v);
	}

	peekl(): T {
		if (!this._head) {
			throw new Error("empty list");
		}
		return this._head.val;
	}

	peekr(): T {
		if (!this._tail) {
			throw new Error("empty list");
		}
		return this._tail.val;
	}

	pushl(node: Node<T>): Node<T> {
		node.prev = undefined;
		node.next = this._head;

		if (this._head) {
			this._head.prev = node;
		} else {
			this._tail = node;
		}

		this._head = node;
		this._size++;
		return node;
	}

	pushr(node: Node<T>): Node<T> {
		node.next = undefined;
		node.prev = this._tail;

		if (this._tail) {
			this._tail.next = node;
		} else {
			this._head = node;
		}

		this._tail = node;
		this._size++;
		return node;
	}

	popl(): Node<T> {
		if (!this._head) {
			throw new Error("empty list");
		}

		const node = this._head;
		this._head = node.next;

		if (this._head) {
			this._head.prev = undefined;
		} else {
			this._tail = undefined;
		}

		node.prev = undefined;
		node.next = undefined;
		this._size--;

		return node;
	}

	popr(): Node<T> {
		if (!this._tail) {
			throw new Error("empty list");
		}

		const node = this._tail;
		this._tail = node.prev;

		if (this._tail) {
			this._tail.next = undefined;
		} else {
			this._head = undefined;
		}

		node.prev = undefined;
		node.next = undefined;
		this._size--;

		return node;
	}

	clear(): void {
		let cur = this._head;
		while (cur) {
			const next = cur.next;
			cur.prev = undefined;
			cur.next = undefined;
			cur = next;
		}

		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
	}

	unlink(node: Node<T>): Node<T> {
		if (
			node.next == null
			&& node.prev == null
			&& this._head !== node
			&& this._tail !== node
		) {
			return node;
		}

		if (node.prev) {
			node.prev.next = node.next;
		} else {
			this._head = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		} else {
			this._tail = node.prev;
		}

		node.prev = undefined;
		node.next = undefined;

		this._size--;

		return node;
	}


	*[Symbol.iterator](): Iterator<T> {
		let cur = this._head;
		while (cur) {
			yield cur.val;
			cur = cur.next;
		}
	}

	*nodes(): Generator<Node<T>> {
		let cur = this._head;
		while (cur) {
			yield cur;
			cur = cur.next;
		}
	}
}

Deno.test("List", () => {
	const list = new List<number>();

	list.pushr(list.mknode(1));
	list.pushr(list.mknode(2));

	for (const ele of list) {
		console.log(ele);
	}
});
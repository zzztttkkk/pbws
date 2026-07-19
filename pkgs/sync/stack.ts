class Node<T> {
	val: T;
	next?: Node<T>;

	constructor(v: T) {
		this.val = v;
	}
}

export enum Order {
	FIFO,
	LIFO,
}

export class Queue<T> {
	protected _order: Order = Order.FIFO;
	private _head?: Node<T>;
	private _tail?: Node<T>;
	private _depth = 0;

	get depth(): number {
		return this._depth;
	}

	empty(): boolean {
		return this._depth === 0;
	}

	peek(): T {
		if (this.empty()) {
			throw new Error("empty collection");
		}
		return this._head!.val;
	}

	push(v: T) {
		this._depth++;
		const node = new Node(v);

		switch (this._order) {
			case Order.FIFO: {
				if (this._tail) {
					this._tail.next = node;
				} else {
					this._head = node;
				}
				this._tail = node;
				break;
			}
			case Order.LIFO: {
				node.next = this._head;
				this._head = node;
				if (!this._tail) {
					this._tail = node;
				}
			}
		}
	}

	pop(): T {
		if (!this._head) {
			throw new Error("empty stack");
		}
		this._depth--;
		const val = this._head.val;
		this._head = this._head.next;
		if (!this._head) this._tail = undefined;
		return val;
	}
}

export class Stack<T> extends Queue<T> {
	constructor() {
		super();
		this._order = Order.LIFO;
	}
}
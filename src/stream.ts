import { Duplex, Writable, Transform, Readable } from 'stronger-typed-streams';
export { Duplex, Writable, Transform, Readable } from 'stronger-typed-streams';
import { dissoc, filter, map } from 'ramda';

/**
 * Given stream (which outputs chunks of tyoe `O`) it will return a Promise that
 * resolves to an array of O[].
 */
export function streamDataCollector<O>(r: Readable<O>|Transform<any, O>, cb?: Callback<O[]>): Promise<O[]> {
    let resolved = false;
    let data: O[] = [];
    let getPromise = (f) => {
        let res, rej;
        if (cb) {
            return f(() => {}, () => {});
        }
        return new Promise(f);
    };

    return getPromise((resolve, reject) => {
        r.on('data', (d: O) => {
            data.push(d);
        });
        r.on('error', (e) => {
            if (resolved) { return; }
            resolved = true;
            reject(e);
            cb ? cb(e, data) : null;
        });
        r.on('end', () => {
            if (resolved) { return; }
            resolved = true;
            resolve(data);
            cb ? cb(null, data) : null;
            data = [];
        });
    });
}

/**
 * Super basic re-implementation of @caolan's `async.map` using Node streams and
 * other functions / classes within this library.
 */
export function asyncMap<X, Y>(worker: (x: X, cb: Callback<Y>) => void, xs: X[], next: Callback<Y[]>): void {

    let p = new ArrayReadable<X>(xs).pipe(
        new MapTransform<X, Y>(worker, {objectMode: true})
    );

    streamDataCollector(p, next);
}

/**
 * Given an array of type `T`, convert it into a stream of type `T`.
 */
export class ArrayReadable<T> extends Readable<T> {

    private i: number = 0;

    constructor(private a: T[], private delay: number = 0) {
        super({objectMode: true});
    }

    _read() {
        setTimeout(
            () => {
                if (this.i > this.a.length) { return; }
                if (this.i == this.a.length) {
                    return this.push(null);
                }
                this.push(this.a[this.i++]);
            },
            this.delay
        );
    }
}

/**
 * The function that you pass to `ScanTransform` to do the processing.
 */
export interface ScanFunc<I, O> {
    (acc: O, a: I, next: (e: null|undefined|Error, b?: O) => void): void;
}

/**
 * Scan is like Reduce, except that it outputs every intermediate value, not
 * just the final result. If you want reduce combine this with `FinalDuplex`.
 */
export class ScanTransform<I, O> extends Transform<I, O> {

    protected f: ScanFunc<I, O>;
    private acc: O;

    constructor(scanFunc: ScanFunc<I, O>, acc: O, opts = {}) {
        super(opts);
        this.f = scanFunc;
        this.acc = acc;
    }

    _transform(a: I, encoding, cb) {
        this.f(this.acc, a, (e, b) => {
            if (e) { return cb(e); }
            if (b) {
                this.acc = b;
                this.push(b);
            }
            cb();
        });
    }

}

/**
 * Collects all results until the stream is closed, at which point it outputs
 * all results as an single array
 */
export class CollectorTransform<T> extends Transform<T, T[]> {

    private results: T[] = [];

    constructor(opts) {
        super(opts);
    }

    _flush(cb) {
        this.push(this.results);
        this.results = [];
        cb();
    }

    _transform(a: T, encoding, cb) {
        this.results.push(a);
        cb();
    }

}

/**
 * When a stream is piped into `FinalDuplex` it will only ever pass through the
 * very last item outputted by that stream.
 */
export class FinalDuplex<I> extends Duplex<I, I> {

    private buffer: I|null = null;

    constructor(opts = {}) {
        super(opts);
        this.on('finish', () => {
            if (this.buffer) {
                this.push(this.buffer);
            }
            this.push(null);
        });
    }

    _write(chunk: I, encoding, cb) {
        this.buffer = chunk;
        cb();
    }

    _read(n) { }

}

/**
 * Comparator function for `SortDuplex`
 */
export interface SortDuplexCompareFunc<I> {
    (a: I, b: I): number;
}

/**
 * Will sort the data piped into it using a supplied `SortDuplexCompareFunc`
 */
export class SortDuplex<I> extends Duplex<I, I> {

    private buffer: I[] = [];
    private readCount = 0;
    private writeFinished = false;
    private started = false;

    constructor(sortFunc: SortDuplexCompareFunc<I>, opts = {}) {
        super(opts);
        this.on('finish', () => {
            this.writeFinished = true;
            this.buffer.sort(sortFunc);
        });
    }

    _write(chunk: I, encoding, cb) {
        this.buffer.push(chunk);
        cb();
    }

    _read(n) {
        this.readCount = this.readCount + n;
        if (this.started) { return; }
        this.started = true;
        let interval = setInterval(() => {
            if (this.writeFinished && this.readCount) {
                while (this.readCount > 0 && this.buffer.length) {
                    this.push(<I>this.buffer.shift());
                    this.readCount = this.readCount - 1;
                }
                if (this.buffer.length === 0) {
                        this.push(null);
                        clearInterval(interval);
                }
            }
        }, 100);
    }

}


/**
 * Worker for `MapTransform`
 */
export interface MapFunc<I, O> {
    (a: I, next: (e: null|undefined|Error, b?: O) => void): void;
}

/**
 * Given a stream of type `I` is piped in and a function that maps `I` to `O`. This
 * will output a stream of type `O`.
 */
export class MapTransform<I, O> extends Transform<I, O> {

    private f: MapFunc<I, O>;

    constructor(mapFunc: MapFunc<I, O>, opts = {}) {
        super(opts);
        this.f = mapFunc;
    }

    _transform(a: I, encoding, cb) {
        this.f(a, (e, b) => {
            if (e) { return cb(e); }
            if (b) {
                this.push(b);
            }
            cb();
        });
    }

}

/**
 * When you `add()` (which is not pipe) streams into this then any errors
 * emitted by that stream will be outputted in the stream coming from this.
 */
export class ErrorStream extends Readable<Error> {

    private pipeCount: number = 0;

    constructor(opts = {}) {
        super(opts);
    }

    add(s: Readable<any> | Transform<any, any> | Writable<any> | Duplex<any, any>) {
        s.on('unpipe', (ss) => {
            ss.pipe(s);
        });
        s.on('error', (e) => {
            this.push(e);
        });
        this.pipeCount = this.pipeCount + 1;
        s.on('end', () => {
            this.pipeCount = this.pipeCount - 1;
            if (this.pipeCount == 0) {
                this.push(null);
            }
        });
    }

    _read(size: number = 1) { }

}

/**
 * Used by FilterTransform to output items which were filtered out. See
 * `FilterTransform.getRejectedReader()`.
 */
export class RejectedFilterTransformStream<T> extends Readable<T> {

    private vals: T[] = [];

    _read(size: number): void {
        while (size-- && this.vals.length) {
            let v = this.vals.shift();
            if (v) { this.push(v); }
        }
    }
}

/**
 * The worker used in `FilterTransform`.
 */
export interface FilterFunc<T> {
    (a: T, next: (e: null|undefined|Error, b?: boolean) => void): void;
}

/**
 * A `Transform` which will filter out items for which the `FilterFunc` returns
 * non truthy values.
 */
export class FilterTransform<T> extends Transform<T, T> {

    private f: FilterFunc<T>;
    private rejectedReader: RejectedFilterTransformStream<T>;

    constructor(opts = {}, filterFunc: FilterFunc<T>, performNegative: boolean = true) {
        super(opts);
        this.f = filterFunc;
        if (!performNegative) { return; }

        this.rejectedReader = new RejectedFilterTransformStream<T>(opts);
        this.on('end', () => {
            this.rejectedReader.push(null);
        });
    }

    getRejectedReader() { return this.rejectedReader; }

    _flush(cb) {
        cb();
    }

    _transform(a: T, encoding, cb) {
        this.f(a, (e, b) => {
            if (e) { return cb(e); }
            if (b) {
                this.push(a);
            } else {
                this.rejectedReader.push(a);
            }
            cb();
        });
    }


}

class JoinerWritable<T> extends Writable<T> {
    constructor(private onWrite: (chunk, encoding) => void, opts) {
        super(opts);
    }
    _write(chunk: T, encoding: string, callback: Function) {
        this.onWrite(chunk, encoding);
        callback();
    }
}

/**
 * Given a left stream outputting `L` and right stream outputting `R`, as well
 * as some logic to combine them (in `onData()`) this class will produce output
 * of type `O`.
 */
export abstract class Joiner<L, R, O> extends Readable<O> {

    private leftBuffer: (L|null)[] = [];
    private rightBuffer: (R|null)[] = [];
    private done = false;
    private started = false;

    public left: Writable<L>;
    public right: Writable<R>;

    constructor(opts: {[k: string]: any} = {}) {

        super(Object.assign(
            {},
            opts,
            dissoc('rightOpts', dissoc('leftOpts', { objectMode: true }))
        ));

        let leftOpts = opts.hasOwnProperty('leftOpts') ? opts.leftOpts : dissoc('leftOpts', { objectMode: true });
        let rightOpts = opts.hasOwnProperty('rightOpts') ? opts.leftOpts : dissoc('rightOpts', { objectMode: true });

        this.left = new JoinerWritable<L>(
            (d: L, encoding) => {
                this.leftBuffer.push(d);
                this.fire();
            }, leftOpts
        );
        this.right = new JoinerWritable<R>(
            (d: R) => {
                this.rightBuffer.push(d);
                this.fire();
            },
            rightOpts
        );

        this.left.on('finish', () => {
            this.leftBuffer.push(null);
            this.fire();
        });
        this.right.on('finish', () => {
            this.rightBuffer.push(null);
            this.fire();
        });
    }

    private handleFireCallback(buffer: any[], v, add, toPush) {
        if (add) { buffer.push(v); }
        if ((this.done) || (toPush === undefined)) { return; }
        if (toPush === null) { this.done = true; }
        this.push(toPush);
    }

    private fire() {
        if (!this.started) { return; }
        let ret = this.onData(this.leftBuffer.concat([]), this.rightBuffer.concat([]));
        if (ret instanceof Error) {
            this.emit('error', ret);
            return;
        }
        let { deadIndicesLeft, deadIndicesRight, toPush } = ret;
        this.remove(this.leftBuffer, deadIndicesLeft);
        this.remove(this.rightBuffer, deadIndicesRight);
        if (toPush) {
            toPush.forEach((val) => {
                this.push(val);
            });
        }
    }

    private remove(buffer: any[], indices) {
        for (let i = buffer.length - 1; i >= 0; i--) {
            if (indices.indexOf(i) > -1) {
                buffer.splice(i, 1);
            }
        }
    }

    /**
     * The method for joining together the left and right datasets.
     *
     * @param L[] leftValues All the left values recieved so far which have not
     *            been cleared.
     * @param R[] rightValues All the right values recieved so far which have
     *            not been cleared.
     * @return O[] An object including deadIndices of leftValues and rightValues
     *             which will be removed from the data so far and the items
     *             `toPush` which will be piped out of this instance.
     */
    abstract onData(leftValues: (L|null)[], rightValues: (R|null)[]): Error| { deadIndicesLeft: number[], deadIndicesRight: number[], toPush: (O|null)[] };

    _read(n) {
        this.started = true;
        this.fire();
    }
}

/**
 * Map function for `RightAfterLeft` which receives all left values (of type `L`)
 * as well as some values from the right (of type `R`). It should return values
 * of type `O` which are the result of joining `L`'s to `R`'s.
 */
export interface RightAfterLeftMapFunc<L, R, O> {
    (ls: L[], rs: R): O|null;
}

/**
 * An simpler implementation of `Joiner` which will keep all items from the left
 * until that stream is finished and then (using `RightAfterLeftMapFunc`) allow
 * mapping/joining of all right values with all left values.
 */
export class RightAfterLeft<L, R, O> extends Joiner<L, R, O> {

    constructor(private mapper: RightAfterLeftMapFunc<L, R, O>, opts = {}) {
        super(opts);
    }

    onData(leftValues: (L|null)[], rightValues: (R|null)[]) {
        if (leftValues[leftValues.length - 1] !== null) {
            return {
                deadIndicesLeft: [],
                deadIndicesRight: [],
                toPush: []
            };
        }

        let myMapper = this.mapper.bind(this, leftValues.filter(l => l !== null));

        let rightValuesToMap = rightValues.filter(r => r !== null);
        let done = rightValues.length != rightValuesToMap.length;
        let vals: (O|null)[] = filter(
            o => o !== null,
            map(myMapper, rightValuesToMap)
        );
        if (done) {
            vals = vals.concat([null]);
        }

        return {
            deadIndicesLeft: done ? leftValues.map((_, i) => i) : [],
            deadIndicesRight: rightValues.map((_, i) => i),
            toPush: vals
        };
    }

}

/**
 * Definition for standard callback
 */
export interface Callback<R> {
    (e: Error|null|undefined, r?: R): void;
}

import { Duplex, Writable, Transform, Readable } from 'stronger-typed-streams';
export { Duplex, Writable, Transform, Readable } from 'stronger-typed-streams';
/**
 * Given stream (which outputs chunks of tyoe `O`) it will return a Promise that
 * resolves to an array of O[].
 */
export declare function streamDataCollector<O>(r: Readable<O> | Transform<any, O>, cb?: Callback<O[]>): Promise<O[]>;
/**
 * Super basic re-implementation of @caolan's `async.map` using Node streams and
 * other functions / classes within this library.
 */
export declare function asyncMap<X, Y>(worker: (x: X, cb: Callback<Y>) => void, xs: X[], next: Callback<Y[]>): void;
/**
 * Given an array of type `T`, convert it into a stream of type `T`.
 */
export declare class ArrayReadable<T> extends Readable<T> {
    private a;
    private delay;
    private i;
    constructor(a: T[], delay?: number);
    _read(): void;
}
/**
 * The function that you pass to `ScanTransform` to do the processing.
 */
export interface ScanFunc<I, O> {
    (acc: O, a: I, next: (e: null | undefined | Error, b?: O) => void): void;
}
/**
 * Scan is like Reduce, except that it outputs every intermediate value, not
 * just the final result. If you want reduce combine this with `FinalDuplex`.
 */
export declare class ScanTransform<I, O> extends Transform<I, O> {
    protected f: ScanFunc<I, O>;
    private acc;
    constructor(scanFunc: ScanFunc<I, O>, acc: O, opts?: {});
    _transform(a: I, encoding: any, cb: any): void;
}
/**
 * Collects all results until the stream is closed, at which point it outputs
 * all results as an single array
 */
export declare class CollectorTransform<T> extends Transform<T, T[]> {
    private results;
    constructor(opts: any);
    _flush(cb: any): void;
    _transform(a: T, encoding: any, cb: any): void;
}
/**
 * When a stream is piped into `FirstDuplex` it will only ever pass through the
 * very first item outputted by that stream.
 */
export declare class FirstDuplex<I> extends Duplex<I, I> {
    private done;
    constructor(opts?: {});
    _write(chunk: I, encoding: any, cb: any): void;
    _read(n: any): void;
}
/**
 * When a stream is piped into `FinalDuplex` it will only ever pass through the
 * very last item outputted by that stream.
 */
export declare class FinalDuplex<I> extends Duplex<I, I> {
    private buffer;
    constructor(opts?: {});
    _write(chunk: I, encoding: any, cb: any): void;
    _read(n: any): void;
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
export declare class SortDuplex<I> extends Duplex<I, I> {
    private buffer;
    private readCount;
    private writeFinished;
    private started;
    constructor(sortFunc: SortDuplexCompareFunc<I>, opts?: {});
    _write(chunk: I, encoding: any, cb: any): void;
    _read(n: any): void;
}
/**
 * Worker for `MapTransform`
 */
export interface MapFunc<I, O> {
    (a: I, next: (e: null | undefined | Error, b?: O) => void): void;
}
/**
 * Given a stream of type `T[]` is broken up into a stream of T.
 */
export declare class FlattenTransform<T> extends Transform<T[], T> {
    _transform(ts: T[], encoding: any, cb: any): void;
}
/**
 * Given a stream of type `I` is piped in and a function that maps `I` to `O`. This
 * will output a stream of type `O`.
 */
export declare class MapTransform<I, O> extends Transform<I, O> {
    private f;
    constructor(mapFunc: MapFunc<I, O>, opts?: {});
    _transform(a: I, encoding: any, cb: any): void;
}
/**
 * When you `add()` (which is not pipe) streams into this then any errors
 * emitted by that stream will be outputted in the stream coming from this.
 */
export declare class ErrorStream extends Readable<Error> {
    private pipeCount;
    constructor(opts?: {});
    add(s: Readable<any> | Transform<any, any> | Writable<any> | Duplex<any, any>): void;
    _read(size?: number): void;
}
/**
 * Used by FilterTransform to output items which were filtered out. See
 * `FilterTransform.getRejectedReader()`.
 */
export declare class RejectedFilterTransformStream<T> extends Readable<T> {
    private vals;
    _read(size: number): void;
}
/**
 * The worker used in `FilterTransform`.
 */
export interface FilterFunc<T> {
    (a: T, next: (e: null | undefined | Error, b?: boolean) => void): void;
}
/**
 * A `Transform` which will filter out items for which the `FilterFunc` returns
 * non truthy values.
 */
export declare class FilterTransform<T> extends Transform<T, T> {
    private f;
    private rejectedReader;
    constructor(opts: {} | undefined, filterFunc: FilterFunc<T>, performNegative?: boolean);
    getRejectedReader(): RejectedFilterTransformStream<T>;
    _flush(cb: any): void;
    _transform(a: T, encoding: any, cb: any): void;
}
/**
 * Joins multiple steams into one. It is expected that all input streams will be
 * of the same type.
 */
export declare class ParallelJoin<T> extends Readable<T> {
    inputs: Writable<T>[];
    constructor(opts?: {
        [k: string]: any;
    });
    _read(n: any): void;
    add(opts?: {
        [k: string]: any;
    }): Writable<T>;
}
/**
 * Given a left stream outputting `L` and right stream outputting `R`, as well
 * as some logic to combine them (in `onData()`) this class will produce output
 * of type `O`.
 */
export declare abstract class AbstractLeftRightJoiner<L, R, O> extends Readable<O> {
    private leftBuffer;
    private rightBuffer;
    private done;
    private started;
    left: Writable<L>;
    right: Writable<R>;
    constructor(opts?: {
        [k: string]: any;
    });
    private handleFireCallback(buffer, v, add, toPush);
    private fire();
    private remove(buffer, indices);
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
    abstract onData(leftValues: (L | null)[], rightValues: (R | null)[]): Error | {
        deadIndicesLeft: number[];
        deadIndicesRight: number[];
        toPush: (O | null)[];
    };
    _read(n: any): void;
}
/**
 * Map function for `RightAfterLeft` wich can be called multiple times receives
 * all left values (of type `L`) as well as some values from the right (of type
 * `R`).  It should return `O[]` which are the result of joining `L`'s to `R`'s.
 */
export interface RightAfterLeftMapFunc<L, R, O> {
    (ls: L[], rs: R): O[];
}
/**
 * An simpler implementation of `Joiner` which will keep all items from the left
 * until that stream is finished and then (using `RightAfterLeftMapFunc`) allow
 * mapping/joining of all right values with all left values.
 */
export declare class RightAfterLeft<L, R, O> extends AbstractLeftRightJoiner<L, R, O> {
    private mapper;
    constructor(mapper: RightAfterLeftMapFunc<L, R, O>, opts?: {});
    onData(leftValues: (L | null)[], rightValues: (R | null)[]): {
        deadIndicesLeft: number[];
        deadIndicesRight: number[];
        toPush: (O | null)[];
    };
}
/**
 * Definition for standard callback
 */
export interface Callback<R> {
    (e: Error | null | undefined, r?: R): void;
}

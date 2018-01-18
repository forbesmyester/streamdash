"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stronger_typed_streams_1 = require("stronger-typed-streams");
var stronger_typed_streams_2 = require("stronger-typed-streams");
exports.Duplex = stronger_typed_streams_2.Duplex;
exports.Writable = stronger_typed_streams_2.Writable;
exports.Transform = stronger_typed_streams_2.Transform;
exports.Readable = stronger_typed_streams_2.Readable;
const ramda_1 = require("ramda");
/**
 * Given stream (which outputs chunks of tyoe `O`) it will return a Promise that
 * resolves to an array of O[].
 */
function streamDataCollector(r, cb) {
    let resolved = false;
    let data = [];
    let getPromise = (f) => {
        let res, rej;
        if (cb) {
            return f(() => { }, () => { });
        }
        return new Promise(f);
    };
    return getPromise((resolve, reject) => {
        r.on('data', (d) => {
            data.push(d);
        });
        r.on('error', (e) => {
            if (resolved) {
                return;
            }
            resolved = true;
            reject(e);
            cb ? cb(e, data) : null;
        });
        r.on('end', () => {
            if (resolved) {
                return;
            }
            resolved = true;
            resolve(data);
            cb ? cb(null, data) : null;
            data = [];
        });
    });
}
exports.streamDataCollector = streamDataCollector;
/**
 * Super basic re-implementation of @caolan's `async.map` using Node streams and
 * other functions / classes within this library.
 */
function asyncMap(worker, xs, next) {
    let p = new ArrayReadable(xs).pipe(new MapTransform(worker, { objectMode: true }));
    streamDataCollector(p, next);
}
exports.asyncMap = asyncMap;
/**
 * Given an array of type `T`, convert it into a stream of type `T`.
 */
class ArrayReadable extends stronger_typed_streams_1.Readable {
    constructor(a, delay = 0) {
        super({ objectMode: true });
        this.a = a;
        this.delay = delay;
        this.i = 0;
    }
    _read() {
        setTimeout(() => {
            if (this.i > this.a.length) {
                return;
            }
            if (this.i == this.a.length) {
                return this.push(null);
            }
            this.push(this.a[this.i++]);
        }, this.delay);
    }
}
exports.ArrayReadable = ArrayReadable;
/**
 * Scan is like Reduce, except that it outputs every intermediate value, not
 * just the final result. If you want reduce combine this with `FinalDuplex`.
 */
class ScanTransform extends stronger_typed_streams_1.Transform {
    constructor(scanFunc, acc, opts = {}) {
        super(opts);
        this.f = scanFunc;
        this.acc = acc;
    }
    _transform(a, encoding, cb) {
        this.f(this.acc, a, (e, b) => {
            if (e) {
                return cb(e);
            }
            if (b) {
                this.acc = b;
                this.push(b);
            }
            cb();
        });
    }
}
exports.ScanTransform = ScanTransform;
/**
 * Collects all results until the stream is closed, at which point it outputs
 * all results as an single array
 */
class CollectorTransform extends stronger_typed_streams_1.Transform {
    constructor(opts) {
        super(opts);
        this.results = [];
    }
    _flush(cb) {
        this.push(this.results);
        this.results = [];
        cb();
    }
    _transform(a, encoding, cb) {
        this.results.push(a);
        cb();
    }
}
exports.CollectorTransform = CollectorTransform;
/**
 * When a stream is piped into `FirstDuplex` it will only ever pass through the
 * very first item outputted by that stream.
 */
class FirstDuplex extends stronger_typed_streams_1.Duplex {
    constructor(opts = {}) {
        super(opts);
        this.done = false;
        this.on('finish', () => {
            this.push(null);
        });
    }
    _write(chunk, encoding, cb) {
        if (!this.done) {
            this.push(chunk);
        }
        this.done = true;
        cb();
    }
    _read(n) { }
}
exports.FirstDuplex = FirstDuplex;
/**
 * When a stream is piped into `FinalDuplex` it will only ever pass through the
 * very last item outputted by that stream.
 */
class FinalDuplex extends stronger_typed_streams_1.Duplex {
    constructor(opts = {}) {
        super(opts);
        this.buffer = null;
        this.on('finish', () => {
            if (this.buffer) {
                this.push(this.buffer);
            }
            this.push(null);
        });
    }
    _write(chunk, encoding, cb) {
        this.buffer = chunk;
        cb();
    }
    _read(n) { }
}
exports.FinalDuplex = FinalDuplex;
/**
 * Will sort the data piped into it using a supplied `SortDuplexCompareFunc`
 */
class SortDuplex extends stronger_typed_streams_1.Duplex {
    constructor(sortFunc, opts = {}) {
        super(opts);
        this.buffer = [];
        this.readCount = 0;
        this.writeFinished = false;
        this.started = false;
        this.on('finish', () => {
            this.writeFinished = true;
            this.buffer.sort(sortFunc);
        });
    }
    _write(chunk, encoding, cb) {
        this.buffer.push(chunk);
        cb();
    }
    _read(n) {
        this.readCount = this.readCount + n;
        if (this.started) {
            return;
        }
        this.started = true;
        let interval = setInterval(() => {
            if (this.writeFinished && this.readCount) {
                while (this.readCount > 0 && this.buffer.length) {
                    this.push(this.buffer.shift());
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
exports.SortDuplex = SortDuplex;
/**
 * Given a stream of type `T[]` is broken up into a stream of T.
 */
class FlattenTransform extends stronger_typed_streams_1.Transform {
    _transform(ts, encoding, cb) {
        for (let t of ts) {
            this.push(t);
        }
        cb();
    }
}
exports.FlattenTransform = FlattenTransform;
/**
 * Given a stream of type `I` is piped in and a function that maps `I` to `O`. This
 * will output a stream of type `O`.
 */
class MapTransform extends stronger_typed_streams_1.Transform {
    constructor(mapFunc, opts = {}) {
        super(opts);
        this.f = mapFunc;
    }
    _transform(a, encoding, cb) {
        this.f(a, (e, b) => {
            if (e) {
                return cb(e);
            }
            if (b) {
                this.push(b);
            }
            cb();
        });
    }
}
exports.MapTransform = MapTransform;
/**
 * When you `add()` (which is not pipe) streams into this then any errors
 * emitted by that stream will be outputted in the stream coming from this.
 */
class ErrorStream extends stronger_typed_streams_1.Readable {
    constructor(opts = {}) {
        super(opts);
        this.pipeCount = 0;
    }
    add(s) {
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
    _read(size = 1) { }
}
exports.ErrorStream = ErrorStream;
/**
 * Used by FilterTransform to output items which were filtered out. See
 * `FilterTransform.getRejectedReader()`.
 */
class RejectedFilterTransformStream extends stronger_typed_streams_1.Readable {
    constructor() {
        super(...arguments);
        this.vals = [];
    }
    _read(size) {
        while (size-- && this.vals.length) {
            let v = this.vals.shift();
            if (v) {
                this.push(v);
            }
        }
    }
}
exports.RejectedFilterTransformStream = RejectedFilterTransformStream;
/**
 * A `Transform` which will filter out items for which the `FilterFunc` returns
 * non truthy values.
 */
class FilterTransform extends stronger_typed_streams_1.Transform {
    constructor(opts = {}, filterFunc, performNegative = true) {
        super(opts);
        this.f = filterFunc;
        if (!performNegative) {
            return;
        }
        this.rejectedReader = new RejectedFilterTransformStream(opts);
        this.on('end', () => {
            this.rejectedReader.push(null);
        });
    }
    getRejectedReader() { return this.rejectedReader; }
    _flush(cb) {
        cb();
    }
    _transform(a, encoding, cb) {
        this.f(a, (e, b) => {
            if (e) {
                return cb(e);
            }
            if (b) {
                this.push(a);
            }
            else {
                this.rejectedReader.push(a);
            }
            cb();
        });
    }
}
exports.FilterTransform = FilterTransform;
/**
 * Joins multiple steams into one. It is expected that all input streams will be
 * of the same type.
 */
class ParallelJoin extends stronger_typed_streams_1.Readable {
    constructor(opts = {}) {
        super(Object.assign({}, opts));
        this.inputs = [];
    }
    _read(n) { }
    add(opts = {}) {
        let input = new JoinerWritable((o, e) => {
            this.push(o, e);
        }, opts);
        input.on('finish', () => {
            this.inputs = this.inputs.filter((i) => {
                return i !== input;
            });
            if (this.inputs.length === 0) {
                this.push(null);
            }
        });
        input.on('data', (o) => {
        });
        this.inputs.push(input);
        return input;
    }
}
exports.ParallelJoin = ParallelJoin;
class JoinerWritable extends stronger_typed_streams_1.Writable {
    constructor(onWrite, opts) {
        super(opts);
        this.onWrite = onWrite;
    }
    _write(chunk, encoding, callback) {
        this.onWrite(chunk, encoding);
        callback();
    }
}
/**
 * Given a left stream outputting `L` and right stream outputting `R`, as well
 * as some logic to combine them (in `onData()`) this class will produce output
 * of type `O`.
 */
class AbstractLeftRightJoiner extends stronger_typed_streams_1.Readable {
    constructor(opts = {}) {
        super(Object.assign({}, opts, ramda_1.dissoc('rightOpts', ramda_1.dissoc('leftOpts', { objectMode: true }))));
        this.leftBuffer = [];
        this.rightBuffer = [];
        this.done = false;
        this.started = false;
        let leftOpts = opts.hasOwnProperty('leftOpts') ? opts.leftOpts : ramda_1.dissoc('leftOpts', { objectMode: true });
        let rightOpts = opts.hasOwnProperty('rightOpts') ? opts.leftOpts : ramda_1.dissoc('rightOpts', { objectMode: true });
        this.left = new JoinerWritable((d, encoding) => {
            this.leftBuffer.push(d);
            this.fire();
        }, leftOpts);
        this.right = new JoinerWritable((d) => {
            this.rightBuffer.push(d);
            this.fire();
        }, rightOpts);
        this.left.on('finish', () => {
            this.leftBuffer.push(null);
            this.fire();
        });
        this.right.on('finish', () => {
            this.rightBuffer.push(null);
            this.fire();
        });
    }
    handleFireCallback(buffer, v, add, toPush) {
        if (add) {
            buffer.push(v);
        }
        if ((this.done) || (toPush === undefined)) {
            return;
        }
        if (toPush === null) {
            this.done = true;
        }
        this.push(toPush);
    }
    fire() {
        if (!this.started) {
            return;
        }
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
    remove(buffer, indices) {
        for (let i = buffer.length - 1; i >= 0; i--) {
            if (indices.indexOf(i) > -1) {
                buffer.splice(i, 1);
            }
        }
    }
    _read(n) {
        this.started = true;
        this.fire();
    }
}
exports.AbstractLeftRightJoiner = AbstractLeftRightJoiner;
/**
 * An simpler implementation of `Joiner` which will keep all items from the left
 * until that stream is finished and then (using `RightAfterLeftMapFunc`) allow
 * mapping/joining of all right values with all left values.
 */
class RightAfterLeft extends AbstractLeftRightJoiner {
    constructor(mapper, opts = {}) {
        super(opts);
        this.mapper = mapper;
        this.buffer = _bufferArrayToLastMarkerArray();
    }
    onData(leftValues, rightValues) {
        if (leftValues[leftValues.length - 1] !== null) {
            return {
                deadIndicesLeft: [],
                deadIndicesRight: [],
                toPush: []
            };
        }
        let rightValuesToMap = rightValues.filter(r => r !== null);
        let done = rightValues.length != rightValuesToMap.length;
        let myMapper = (right) => {
            let m = this.mapper.bind(this, leftValues.filter(l => l !== null), right[0], right[1]);
            return m();
        };
        let vals = Array.prototype.concat.apply([], ramda_1.filter(o => o !== null, ramda_1.map(myMapper, this.buffer(rightValues))));
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
exports.RightAfterLeft = RightAfterLeft;
function _bufferArrayToLastMarkerArray() {
    let done = false;
    let grp = [];
    function mapper(g) {
        return [g, false];
    }
    return function (ii) {
        if (done) {
            return [];
        }
        let r = grp.map(mapper);
        if (ii.indexOf(null) > -1) {
            r = r.concat(ii.filter(z => z !== null).map(mapper));
            r[r.length - 1][1] = true;
            done = true;
            return r;
        }
        grp = ii.filter(z => z !== null);
        return r;
    };
}
exports._bufferArrayToLastMarkerArray = _bufferArrayToLastMarkerArray;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N0cmVhbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1FQUErRTtBQUMvRSxpRUFBK0U7QUFBdEUsMENBQUEsTUFBTSxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQUUsNkNBQUEsU0FBUyxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQzlDLGlDQUE0QztBQUU1Qzs7O0dBR0c7QUFDSCw2QkFBdUMsQ0FBZ0MsRUFBRSxFQUFrQjtJQUN2RixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7SUFDckIsSUFBSSxJQUFJLEdBQVEsRUFBRSxDQUFDO0lBQ25CLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNiLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDTCxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQU8sQ0FBQyxFQUFFLFFBQU8sQ0FBQyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQixDQUFDLENBQUM7SUFFRixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDOUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFJO1lBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNaLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBQUMsQ0FBQztZQUN6QixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNWLEVBQUUsR0FB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
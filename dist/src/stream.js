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
class Joiner extends stronger_typed_streams_1.Readable {
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
exports.Joiner = Joiner;
/**
 * An simpler implementation of `Joiner` which will keep all items from the left
 * until that stream is finished and then (using `RightAfterLeftMapFunc`) allow
 * mapping/joining of all right values with all left values.
 */
class RightAfterLeft extends Joiner {
    constructor(mapper, opts = {}) {
        super(opts);
        this.mapper = mapper;
    }
    onData(leftValues, rightValues) {
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
        let vals = Array.prototype.concat.apply([], ramda_1.filter(o => o !== null, ramda_1.map(myMapper, rightValuesToMap)));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N0cmVhbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1FQUErRTtBQUMvRSxpRUFBK0U7QUFBdEUsMENBQUEsTUFBTSxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQUUsNkNBQUEsU0FBUyxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQzlDLGlDQUE0QztBQUU1Qzs7O0dBR0c7QUFDSCw2QkFBdUMsQ0FBZ0MsRUFBRSxFQUFrQjtJQUN2RixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7SUFDckIsSUFBSSxJQUFJLEdBQVEsRUFBRSxDQUFDO0lBQ25CLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNiLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDTCxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQU8sQ0FBQyxFQUFFLFFBQU8sQ0FBQyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQixDQUFDLENBQUM7SUFFRixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDOUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFJO1lBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNaLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBQUMsQ0FBQztZQUN6QixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNWLEVBQUUsR0FB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
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
        let vals = ramda_1.filter(o => o !== null, ramda_1.map(myMapper, rightValuesToMap));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N0cmVhbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG1FQUErRTtBQUMvRSxpRUFBK0U7QUFBdEUsMENBQUEsTUFBTSxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQUUsNkNBQUEsU0FBUyxDQUFBO0FBQUUsNENBQUEsUUFBUSxDQUFBO0FBQzlDLGlDQUE0QztBQUU1Qzs7O0dBR0c7QUFDSCw2QkFBdUMsQ0FBZ0MsRUFBRSxFQUFrQjtJQUN2RixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7SUFDckIsSUFBSSxJQUFJLEdBQVEsRUFBRSxDQUFDO0lBQ25CLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNiLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDTCxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQU8sQ0FBQyxFQUFFLFFBQU8sQ0FBQyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQixDQUFDLENBQUM7SUFFRixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDOUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFJO1lBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNaLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBQUMsQ0FBQztZQUN6QixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNWLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFO1lBQ1IsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLENBQUM7WUFBQyxDQUFDO1lBQ3pCLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2QsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzNCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDZCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQTdCRCxrREE2QkM7QUFFRDs7O0dBR0c7QUFDSCxrQkFBK0IsTUFBdUMsRUFBRSxFQUFPLEVBQUUsSUFBbUI7SUFFaEcsSUFBSSxDQUFDLEdBQUcsSUFBSSxhQUFhLENBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUNqQyxJQUFJLFlBQVksQ0FBTyxNQUFNLEVBQUUsRUFBQyxVQUFVLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FDckQsQ0FBQztJQUVGLG1CQUFtQixDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBUEQsNEJBT0M7QUFFRDs7R0FFRztBQUNILG1CQUE4QixTQUFRLGlDQUFXO0lBSTdDLFlBQW9CLENBQU0sRUFBVSxRQUFnQixDQUFDO1FBQ2pELEtBQUssQ0FBQyxFQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDO1FBRFYsTUFBQyxHQUFELENBQUMsQ0FBSztRQUFVLFVBQUssR0FBTCxLQUFLLENBQVk7UUFGN0MsTUFBQyxHQUFXLENBQUMsQ0FBQztJQUl0QixDQUFDO0lBRUQsS0FBSztRQUNELFVBQVUsQ0FDTjtZQUNJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUFDLENBQUM7WUFDdkMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoQyxDQUFDLEVBQ0QsSUFBSSxDQUFDLEtBQUssQ0FDYixDQUFDO0lBQ04sQ0FBQztDQUNKO0FBcEJELHNDQW9CQztBQVNEOzs7R0FHRztBQUNILG1CQUFpQyxTQUFRLGtDQUFlO0lBS3BELFlBQVksUUFBd0IsRUFBRSxHQUFNLEVBQUUsSUFBSSxHQUFHLEVBQUU7UUFDbkQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ1osSUFBSSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUM7UUFDbEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDbkIsQ0FBQztJQUVELFVBQVUsQ0FBQyxDQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDekIsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDeEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFDYixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLENBQUM7WUFDRCxFQUFFLEVBQUUsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUVKO0FBdEJELHNDQXNCQztBQUVEOzs7R0FHRztBQUNILHdCQUFtQyxTQUFRLGtDQUFpQjtJQUl4RCxZQUFZLElBQUk7UUFDWixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFIUixZQUFPLEdBQVEsRUFBRSxDQUFDO0lBSTFCLENBQUM7SUFFRCxNQUFNLENBQUMsRUFBRTtRQUNMLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLEVBQUUsRUFBRSxDQUFDO0lBQ1QsQ0FBQztJQUVELFVBQVUsQ0FBQyxDQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDekIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsRUFBRSxFQUFFLENBQUM7SUFDVCxDQUFDO0NBRUo7QUFuQkQsZ0RBbUJDO0FBRUQ7OztHQUdHO0FBQ0gsaUJBQTRCLFNBQVEsK0JBQVk7SUFJNUMsWUFBWSxJQUFJLEdBQUcsRUFBRTtRQUNqQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFIUixXQUFNLEdBQVcsSUFBSSxDQUFDO1FBSTFCLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFO1lBQ2QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0IsQ0FBQztZQUNELElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUN6QixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixFQUFFLEVBQUUsQ0FBQztJQUNULENBQUM7SUFFRCxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7Q0FFZjtBQXJCRCxrQ0FxQkM7QUFTRDs7R0FFRztBQUNILGdCQUEyQixTQUFRLCtCQUFZO0lBTzNDLFlBQVksUUFBa0MsRUFBRSxJQUFJLEdBQUcsRUFBRTtRQUNyRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFOUixXQUFNLEdBQVEsRUFBRSxDQUFDO1FBQ2pCLGNBQVMsR0FBRyxDQUFDLENBQUM7UUFDZCxrQkFBYSxHQUFHLEtBQUssQ0FBQztRQUN0QixZQUFPLEdBQUcsS0FBSyxDQUFDO1FBSXBCLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFO1lBQ2QsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixFQUFFLEVBQUUsQ0FBQztJQUNULENBQUM7SUFFRCxLQUFLLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLElBQUksUUFBUSxHQUFHLFdBQVcsQ0FBQztZQUN2QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUN2QyxPQUFPLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQzlDLElBQUksQ0FBQyxJQUFJLENBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUNsQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2hCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDaEMsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDWixDQUFDO0NBRUo7QUF0Q0QsZ0NBc0NDO0FBVUQ7OztHQUdHO0FBQ0gsa0JBQWdDLFNBQVEsa0NBQWU7SUFJbkQsWUFBWSxPQUFzQixFQUFFLElBQUksR0FBRyxFQUFFO1FBQ3pDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNaLElBQUksQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxVQUFVLENBQUMsQ0FBSSxFQUFFLFFBQVEsRUFBRSxFQUFFO1FBQ3pCLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDWCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixDQUFDO1lBQ0QsRUFBRSxFQUFFLENBQUM7UUFDVCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FFSjtBQW5CRCxvQ0FtQkM7QUFFRDs7O0dBR0c7QUFDSCxpQkFBeUIsU0FBUSxpQ0FBZTtJQUk1QyxZQUFZLElBQUksR0FBRyxFQUFFO1FBQ2pCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUhSLGNBQVMsR0FBVyxDQUFDLENBQUM7SUFJOUIsQ0FBQztJQUVELEdBQUcsQ0FBQyxDQUF5RTtRQUN6RSxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUU7WUFDZCxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDWixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRTtZQUNSLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BCLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBZSxDQUFDLElBQUksQ0FBQztDQUU5QjtBQTFCRCxrQ0EwQkM7QUFFRDs7O0dBR0c7QUFDSCxtQ0FBOEMsU0FBUSxpQ0FBVztJQUFqRTs7UUFFWSxTQUFJLEdBQVEsRUFBRSxDQUFDO0lBUTNCLENBQUM7SUFORyxLQUFLLENBQUMsSUFBWTtRQUNkLE9BQU8sSUFBSSxFQUFFLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQVZELHNFQVVDO0FBU0Q7OztHQUdHO0FBQ0gscUJBQWdDLFNBQVEsa0NBQWU7SUFLbkQsWUFBWSxJQUFJLEdBQUcsRUFBRSxFQUFFLFVBQXlCLEVBQUUsa0JBQTJCLElBQUk7UUFDN0UsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ1osSUFBSSxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDO1FBQUMsQ0FBQztRQUVqQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksNkJBQTZCLENBQUksSUFBSSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUU7WUFDWCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxpQkFBaUIsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFFbkQsTUFBTSxDQUFDLEVBQUU7UUFDTCxFQUFFLEVBQUUsQ0FBQztJQUNULENBQUM7SUFFRCxVQUFVLENBQUMsQ0FBSSxFQUFFLFFBQVEsRUFBRSxFQUFFO1FBQ3pCLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDWCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsQ0FBQztZQUNELEVBQUUsRUFBRSxDQUFDO1FBQ1QsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBR0o7QUFuQ0QsMENBbUNDO0FBRUQsb0JBQXdCLFNBQVEsaUNBQVc7SUFDdkMsWUFBb0IsT0FBa0MsRUFBRSxJQUFJO1FBQ3hELEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQURJLFlBQU8sR0FBUCxPQUFPLENBQTJCO0lBRXRELENBQUM7SUFDRCxNQUFNLENBQUMsS0FBUSxFQUFFLFFBQWdCLEVBQUUsUUFBa0I7UUFDakQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDOUIsUUFBUSxFQUFFLENBQUM7SUFDZixDQUFDO0NBQ0o7QUFFRDs7OztHQUlHO0FBQ0gsWUFBc0MsU0FBUSxpQ0FBVztJQVVyRCxZQUFZLE9BQTJCLEVBQUU7UUFFckMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQ2YsRUFBRSxFQUNGLElBQUksRUFDSixjQUFNLENBQUMsV0FBVyxFQUFFLGNBQU0sQ0FBQyxVQUFVLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUNoRSxDQUFDLENBQUM7UUFkQyxlQUFVLEdBQWUsRUFBRSxDQUFDO1FBQzVCLGdCQUFXLEdBQWUsRUFBRSxDQUFDO1FBQzdCLFNBQUksR0FBRyxLQUFLLENBQUM7UUFDYixZQUFPLEdBQUcsS0FBSyxDQUFDO1FBYXBCLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsR0FBRyxjQUFNLENBQUMsVUFBVSxFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUcsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxHQUFHLGNBQU0sQ0FBQyxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUU3RyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksY0FBYyxDQUMxQixDQUFDLENBQUksRUFBRSxRQUFRO1lBQ1gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hCLENBQUMsRUFBRSxRQUFRLENBQ2QsQ0FBQztRQUNGLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQzNCLENBQUMsQ0FBSTtZQUNELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNoQixDQUFDLEVBQ0QsU0FBUyxDQUNaLENBQUM7UUFFRixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUU7WUFDbkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFO1lBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzVCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxNQUFhLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxNQUFNO1FBQ3BELEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQUMsQ0FBQztRQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBQ3RELEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFBQyxDQUFDO1FBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUVPLElBQUk7UUFDUixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDO1FBQUMsQ0FBQztRQUM5QixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0UsRUFBRSxDQUFDLENBQUMsR0FBRyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEIsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUNELElBQUksRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDO1FBQ3hELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNoRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ1QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUc7Z0JBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBRU8sTUFBTSxDQUFDLE1BQWEsRUFBRSxPQUFPO1FBQ2pDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMxQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEIsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBZUQsS0FBSyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztDQUNKO0FBOUZELHdCQThGQztBQVdEOzs7O0dBSUc7QUFDSCxvQkFBcUMsU0FBUSxNQUFlO0lBRXhELFlBQW9CLE1BQXNDLEVBQUUsSUFBSSxHQUFHLEVBQUU7UUFDakUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBREksV0FBTSxHQUFOLE1BQU0sQ0FBZ0M7SUFFMUQsQ0FBQztJQUVELE1BQU0sQ0FBQyxVQUFzQixFQUFFLFdBQXVCO1FBQ2xELEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDO2dCQUNILGVBQWUsRUFBRSxFQUFFO2dCQUNuQixnQkFBZ0IsRUFBRSxFQUFFO2dCQUNwQixNQUFNLEVBQUUsRUFBRTthQUNiLENBQUM7UUFDTixDQUFDO1FBRUQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTFFLElBQUksZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO1FBQzNELElBQUksSUFBSSxHQUFHLFdBQVcsQ0FBQyxNQUFNLElBQUksZ0JBQWdCLENBQUMsTUFBTSxDQUFDO1FBQ3pELElBQUksSUFBSSxHQUFlLGNBQU0sQ0FDekIsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQ2YsV0FBRyxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUNsQyxDQUFDO1FBQ0YsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNQLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsTUFBTSxDQUFDO1lBQ0gsZUFBZSxFQUFFLElBQUksR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQ3hELGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5QyxNQUFNLEVBQUUsSUFBSTtTQUNmLENBQUM7SUFDTixDQUFDO0NBRUo7QUFsQ0Qsd0NBa0NDIn0=
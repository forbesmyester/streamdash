"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const stream_1 = require("../src/stream");
function aReduce(f, acc, xs, next) {
    let myXs = xs.concat([]);
    let initiator = () => {
        if (myXs.length == 0) {
            return next(null, acc);
        }
        f(acc, myXs.shift(), (err, newAcc) => {
            if (err) {
                return next(err);
            }
            acc = newAcc;
            initiator();
        });
    };
    initiator();
}
let getThingLetters = () => {
    return [
        { name: "A", type: "Letter" },
        { name: "B", type: "Letter" },
        { name: "C", type: "Letter" },
        { name: "D", type: "Letter" },
        { name: "E", type: "Letter" }
    ];
};
let getThingNumbers = () => {
    return [
        { name: "1", type: "Number" },
        { name: "2", type: "Number" },
        { name: "3", type: "Number" },
        { name: "4", type: "Number" },
        { name: "5", type: "Number" }
    ];
};
class Outer extends stream_1.Writable {
    constructor() {
        super(...arguments);
        this.out = [];
    }
    _write(thing, encoding, cb) {
        this.out.push(thing);
        cb();
    }
    get() {
        return this.out;
    }
}
ava_1.default('Collector (non error)', function (tst) {
    let src = new stream_1.ArrayReadable([
        { name: "Matt", type: "Human" },
        { name: "Pluto", type: "Dog" }
    ]);
    return stream_1.streamDataCollector(src).then((things) => {
        tst.deepEqual(things, [{ name: "Matt", type: "Human" }, { name: "Pluto", type: "Dog" }]);
    });
});
ava_1.default.cb('Can convert an array into a stream', function (tst) {
    let src = new stream_1.ArrayReadable([
        { name: "Matt", type: "Human" },
        { name: "Pluto", type: "Dog" }
    ]);
    let dst = new Outer({ objectMode: true });
    src.pipe(dst);
    dst.on('finish', () => {
        tst.is(dst.get().length, 2);
        tst.end();
    });
});
ava_1.default.cb('Can filter', function (tst) {
    let src = new stream_1.ArrayReadable(getThingLetters());
    let filter = new stream_1.FilterTransform({ objectMode: true }, (a, cb) => {
        if (a.name == 'C') {
            return cb(null, false);
        }
        cb(null, true);
    });
    let dst = new Outer({ objectMode: true });
    let rejected = new Outer({ objectMode: true });
    src.pipe(filter).pipe(dst);
    filter.getRejectedReader().pipe(rejected);
    let done = [];
    let doneHandler = (typ) => {
        done.push(typ);
        if (done.length < 2) {
            return;
        }
        tst.true(done.indexOf('dst') > -1);
        tst.true(done.indexOf('rejected') > -1);
        tst.end();
    };
    rejected.on('finish', () => {
        tst.deepEqual(rejected.get(), [{ name: "C", type: "Letter" }]);
        doneHandler('rejected');
    });
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [
            { name: "A", type: "Letter" },
            { name: "B", type: "Letter" },
            { name: "D", type: "Letter" },
            { name: "E", type: "Letter" }
        ]);
        doneHandler('dst');
    });
});
ava_1.default.cb('Has an ErrorStream', (tst) => {
    let src = new stream_1.ArrayReadable(getThingLetters());
    let filter1 = new stream_1.FilterTransform({ objectMode: true }, (a, cb) => {
        if (a.name == 'B') {
            return cb(new Error("It is B"));
        }
        cb(null, true);
    });
    let filter2 = new stream_1.FilterTransform({ objectMode: true }, (a, cb) => {
        if (a.name == 'D') {
            return cb(new Error("It is D"));
        }
        cb(null, true);
    });
    let dst = new Outer({ objectMode: true });
    let eDst = new Outer({ objectMode: true });
    src.pipe(filter1).pipe(filter2).pipe(dst);
    let es = new stream_1.ErrorStream({ objectMode: true, len: 1 });
    es.add(filter1);
    es.add(filter2);
    es.pipe(eDst);
    let done = [];
    let doneHandler = (typ) => {
        done.push(typ);
        if (done.length < 2) {
            return;
        }
        tst.true(done.indexOf('pipe') > -1);
        tst.true(done.indexOf('errors') > -1);
        tst.end();
    };
    eDst.on('finish', () => {
        tst.deepEqual(eDst.get().map(e => e.message), ['It is B', 'It is D']);
        doneHandler('errors');
    });
    dst.on('finish', () => {
        let expected = [
            { name: "A", type: "Letter" },
            { name: "C", type: "Letter" },
            { name: "E", type: "Letter" }
        ];
        tst.deepEqual(dst.get(), expected);
        doneHandler('pipe');
    });
});
ava_1.default.cb('Can Collect', (tst) => {
    let src = new stream_1.ArrayReadable(getThingNumbers());
    let collector = new stream_1.CollectorTransform({ objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(collector).pipe(dst);
    dst.on('finish', () => {
        tst.is(dst.get().length, 1);
        tst.deepEqual(dst.get(), [[
                { name: "1", type: "Number" },
                { name: "2", type: "Number" },
                { name: "3", type: "Number" },
                { name: "4", type: "Number" },
                { name: "5", type: "Number" }
            ]]);
        tst.end();
    });
});
ava_1.default.cb('Can Scan', function (tst) {
    let src = new stream_1.ArrayReadable(getThingNumbers());
    let scan = new stream_1.ScanTransform((acc, a, cb) => { cb(null, { n: acc.n + parseInt(a.name, 10) }); }, { n: 2 }, { objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(scan).pipe(dst);
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [
            { n: 3 },
            { n: 5 },
            { n: 8 },
            { n: 12 },
            { n: 17 }
        ]);
        tst.end();
    });
});
ava_1.default.cb('Can Map', function (tst) {
    let src = new stream_1.ArrayReadable(getThingNumbers());
    let map = new stream_1.MapTransform((a, cb) => {
        cb(null, { name: parseInt(a.name, 10), type: a.type });
    }, { objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(map).pipe(dst);
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [
            { name: 1, type: "Number" },
            { name: 2, type: "Number" },
            { name: 3, type: "Number" },
            { name: 4, type: "Number" },
            { name: 5, type: "Number" }
        ]);
        tst.end();
    });
});
ava_1.default.cb('Can First', function (tst) {
    let src = new stream_1.ArrayReadable(getThingNumbers());
    let sort = new stream_1.FirstDuplex({ objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(sort).pipe(dst);
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [{ name: "1", type: "Number" }]);
        tst.end();
    });
});
ava_1.default.cb('Can Final', function (tst) {
    let src = new stream_1.ArrayReadable(getThingNumbers());
    let sort = new stream_1.FinalDuplex({ objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(sort).pipe(dst);
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [{ name: "5", type: "Number" }]);
        tst.end();
    });
});
ava_1.default.cb('Can Sort', function (tst) {
    let src = new stream_1.ArrayReadable(getThingNumbers().reverse());
    let sort = new stream_1.SortDuplex((a, b) => {
        return parseInt(a.name, 10) - parseInt(b.name, 10);
    }, { objectMode: true });
    let dst = new Outer({ objectMode: true });
    src.pipe(sort).pipe(dst);
    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [
            { name: "1", type: "Number" },
            { name: "2", type: "Number" },
            { name: "3", type: "Number" },
            { name: "4", type: "Number" },
            { name: "5", type: "Number" }
        ]);
        tst.end();
    });
});
ava_1.default('ParallelJoin extends Joiner', function (tst) {
    let leftSrc = new stream_1.ArrayReadable([
        { n: 1, dir: 'left' },
        { n: 2, dir: 'left' },
        { n: 3, dir: 'left' }
    ]), rightSrc = new stream_1.ArrayReadable([
        { n: 5, dir: 'right' },
        { n: 4, dir: 'right' },
        { n: 3, dir: 'right' }
    ]);
    let pj = new stream_1.ParallelJoin({ objectMode: true });
    leftSrc.pipe(pj.add({ objectMode: true }));
    rightSrc.pipe(pj.add({ objectMode: true }));
    return stream_1.streamDataCollector(pj)
        .then((adds) => {
        tst.is(adds.length, 6);
        tst.deepEqual(adds.sort(({ n: n1 }, { n: n2 }) => {
            return n1 - n2;
        }), [
            { n: 1, dir: 'left' },
            { n: 2, dir: 'left' },
            { n: 3, dir: 'left' },
            { n: 3, dir: 'right' },
            { n: 4, dir: 'right' },
            { n: 5, dir: 'right' }
        ]);
    })
        .catch((e) => {
        throw e;
    });
});
ava_1.default('RightAfterLeft extends Joiner', function (tst) {
    let mapper = (leftValues, rightValue, done) => {
        let leftVal = leftValues
            .reduce((acc, lv) => { return acc + lv.n; }, 0);
        let v = rightValue.n + leftVal;
        if (v == 10) {
            return [];
        }
        if (done) {
            v = v + 0.5;
        }
        return [{ n: v }];
    };
    let leftSrc = new stream_1.ArrayReadable([
        { n: 1, dir: 'left' },
        { n: 2, dir: 'left' },
        { n: 3, dir: 'left' }
    ]), rightSrc = new stream_1.ArrayReadable([
        { n: 5, dir: 'right' },
        { n: 4, dir: 'right' },
        { n: 3, dir: 'right' }
    ]), joiner = new stream_1.RightAfterLeft(mapper);
    leftSrc.pipe(joiner.left);
    rightSrc.pipe(joiner.right);
    return stream_1.streamDataCollector(joiner)
        .then((adds) => {
        tst.deepEqual(adds, [{ n: 11 }, { n: 9.5 }]);
        tst.is(joiner['rightBuffer'].length, 0);
        tst.is(joiner['leftBuffer'].length, 0);
    })
        .catch((e) => {
        throw e;
    });
});
ava_1.default('_bufferArrayToLastMarkerArray', function (tst) {
    let a = stream_1._bufferArrayToLastMarkerArray();
    tst.deepEqual([], a([1, 2]));
    tst.deepEqual([[1, false], [2, false]], a([3]));
    tst.deepEqual([[3, true]], a([null]));
    tst.deepEqual([], a([]));
    tst.deepEqual([], a([]));
    let b = stream_1._bufferArrayToLastMarkerArray();
    tst.deepEqual([], b([1, 2]));
    tst.deepEqual([[1, false], [2, false]], b([3]));
    tst.deepEqual([[3, false], [4, false], [5, true]], b([4, 5, null]));
    tst.deepEqual([], b([]));
    tst.deepEqual([], b([]));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdGVzdC9zdHJlYW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2QkFBdUI7QUFDdkIsMENBQStSO0FBTy9SLGlCQUF1QixDQUEyQyxFQUFFLEdBQU0sRUFBRSxFQUFPLEVBQUUsSUFBaUI7SUFDbEcsSUFBSSxJQUFJLEdBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUU5QixJQUFJLFNBQVMsR0FBRztRQUNaLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsR0FBRyxFQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNO1lBQ2hDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDOUIsR0FBRyxHQUFNLE1BQU0sQ0FBQztZQUNoQixTQUFTLEVBQUUsQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQztJQUVGLFNBQVMsRUFBRSxDQUFDO0FBQ2hCLENBQUM7QUFHRCxJQUFJLGVBQWUsR0FBa0I7SUFDakMsTUFBTSxDQUFDO1FBQ0gsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFD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Q0FBQyxDQUFDLENBQUM7UUFDTCxNQUFNLENBQUMsQ0FBQztJQUNaLENBQUMsQ0FBQyxDQUFDO0FBRVgsQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsK0JBQStCLEVBQUUsVUFBUyxHQUFHO0lBQzlDLElBQUksQ0FBQyxHQUFHLHNDQUE2QixFQUFVLENBQUM7SUFDaEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pCLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRXpCLElBQUksQ0FBQyxHQUFHLHNDQUE2QixFQUFVLENBQUM7SUFDaEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDekIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDN0IsQ0FBQyxDQUFDLENBQUMifQ==
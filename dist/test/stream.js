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
ava_1.default('Can Flatten', function (tst) {
    let src = new stream_1.ArrayReadable([getThingLetters(), getThingNumbers()]);
    let flatten = new stream_1.FlattenTransform({ objectMode: true });
    src.pipe(flatten);
    return stream_1.streamDataCollector(flatten)
        .then((result) => {
        tst.deepEqual(result, [
            { name: "A", type: "Letter" },
            { name: "B", type: "Letter" },
            { name: "C", type: "Letter" },
            { name: "D", type: "Letter" },
            { name: "E", type: "Letter" },
            { name: "1", type: "Number" },
            { name: "2", type: "Number" },
            { name: "3", type: "Number" },
            { name: "4", type: "Number" },
            { name: "5", type: "Number" }
        ]);
    })
        .catch((e) => {
        throw e;
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
    let mapper = (leftValues, rightValue) => {
        let leftVal = leftValues
            .reduce((acc, lv) => { return acc + lv.n; }, 0);
        let v = rightValue.n + leftVal;
        if (v == 10) {
            return [];
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
        tst.deepEqual(adds, [{ n: 11 }, { n: 9 }]);
        tst.is(joiner['rightBuffer'].length, 0);
        tst.is(joiner['leftBuffer'].length, 0);
    })
        .catch((e) => {
        throw e;
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdGVzdC9zdHJlYW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2QkFBdUI7QUFDdkIsMENBQWtSO0FBT2xSLGlCQUF1QixDQUEyQyxFQUFFLEdBQU0sRUFBRSxFQUFPLEVBQUUsSUFBaUI7SUFDbEcsSUFBSSxJQUFJLEdBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUU5QixJQUFJLFNBQVMsR0FBRztRQUNaLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsR0FBRyxFQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNO1lBQ2hDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDOUIsR0FBRyxHQUFNLE1BQU0sQ0FBQztZQUNoQixTQUFTLEVBQUUsQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQztJQUVGLFNBQVMsRUFBRSxDQUFDO0FBQ2hCLENBQUM7QUFHRCxJQUFJLGVBQWUsR0FBa0I7SUFDakMsTUFBTSxDQUFDO1FBQ0gsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDN0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFD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QUMsVUFBVSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7SUFFL0MsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFekIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUU7UUFDYixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFELEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLENBQUM7QUFHSCxhQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxVQUFTLEdBQUc7SUFFN0IsSUFBSSxHQUFHLEdBQXlCLElBQUksc0JBQWEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBRXJFLElBQUksSUFBSSxHQUFHLElBQUksb0JBQVcsQ0FBUSxFQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDO0lBRXRELElBQUksR0FBRyxHQUFHLElBQUksS0FBSyxDQUFRLEVBQUMsVUFBVSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7SUFFL0MsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFekIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUU7UUFDYixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFELEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLENBQUM7QUFHSCxhQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxVQUFTLEdBQUc7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
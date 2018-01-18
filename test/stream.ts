import test from 'ava';
import { _bufferArrayToLastMarkerArray, FlattenTransform, ParallelJoin, Callback, FirstDuplex, FinalDuplex, SortDuplex, RightAfterLeft, streamDataCollector, CollectorTransform, ScanTransform, MapTransform, ErrorStream, FilterTransform, ArrayReadable, Transform, Readable, Writable }  from '../src/stream';
import { zip, flatten } from 'ramda';

interface Thing { name: string; type: string; }
interface ThingNumber { name: number; type: string; }


function aReduce<R, X>(f: (acc: R, xs: X, cb: Callback<R>) => void, acc: R, xs: X[], next: Callback<R>): void {
    let myXs: X[] = xs.concat([]);

    let initiator = () => {
        if (myXs.length == 0) { return next(null, acc); }
        f(acc, <X>myXs.shift(), (err, newAcc) => {
            if (err) { return next(err); }
            acc = <R>newAcc;
            initiator();
        });
    };

    initiator();
}


let getThingLetters: () => Thing[] = () => {
    return [
        { name: "A", type: "Letter" },
        { name: "B", type: "Letter" },
        { name: "C", type: "Letter" },
        { name: "D", type: "Letter" },
        { name: "E", type: "Letter" }
    ];
};

let getThingNumbers: () => Thing[] = () => {
    return [
        { name: "1", type: "Number" },
        { name: "2", type: "Number" },
        { name: "3", type: "Number" },
        { name: "4", type: "Number" },
        { name: "5", type: "Number" }
    ];
};

class Outer<T> extends Writable<T> {
    private out: T[] = [];
    _write(thing: T, encoding, cb) {
        this.out.push(thing);
        cb();
    }
    get() {
        return this.out;
    }
}

test('Collector (non error)', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable([
        { name: "Matt", type: "Human" },
        { name: "Pluto", type: "Dog" }
    ]);

    return streamDataCollector(src).then(
        (things: Thing[]) => {
            tst.deepEqual(
                things,
                [{ name: "Matt", type: "Human" }, { name: "Pluto", type: "Dog" }]
            );
        }
    );

});


test.cb('Can convert an array into a stream', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable([
        { name: "Matt", type: "Human" },
        { name: "Pluto", type: "Dog" }
    ]);

    let dst = new Outer<Thing>({objectMode: true});

    src.pipe(dst);
    dst.on('finish', () => {
        tst.is(dst.get().length, 2);
        tst.end();
    });
});

test.cb('Can filter', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingLetters());

    let filter = new FilterTransform<Thing>({objectMode: true}, (a, cb) => {
        if (a.name == 'C') {
            return cb(null, false);
        }
        cb(null, true);
    });

    let dst = new Outer<Thing>({objectMode: true});

    let rejected = new Outer<Thing>({objectMode: true});

    src.pipe(filter).pipe(dst);
    filter.getRejectedReader().pipe(rejected);

    let done: string[] = [];
    let doneHandler = (typ) => {
        done.push(typ);
        if (done.length < 2) { return; }
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


test.cb('Has an ErrorStream', (tst) => {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingLetters());

    let filter1 = new FilterTransform<Thing>({objectMode: true}, (a, cb) => {
        if (a.name == 'B') {
            return cb(new Error("It is B"));
        }
        cb(null, true);
    });

    let filter2 = new FilterTransform<Thing>({objectMode: true}, (a, cb) => {
        if (a.name == 'D') {
            return cb(new Error("It is D"));
        }
        cb(null, true);
    });

    let dst = new Outer<Thing>({objectMode: true});
    let eDst = new Outer<Error>({objectMode: true});

    src.pipe(filter1).pipe(filter2).pipe(dst);

    let es = new ErrorStream({objectMode: true, len: 1});
    es.add(filter1);
    es.add(filter2);
    es.pipe(eDst);

    let done: string[] = [];
    let doneHandler = (typ) => {
        done.push(typ);
        if (done.length < 2) { return; }
        tst.true(done.indexOf('pipe') > -1);
        tst.true(done.indexOf('errors') > -1);
        tst.end();
    };


    eDst.on('finish', () => {
        tst.deepEqual(
            eDst.get().map(e => e.message),
            ['It is B', 'It is D']
        );
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

test.cb('Can Collect', (tst) => {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers());

    let collector = new CollectorTransform<Thing>({objectMode: true});

    let dst = new Outer<Thing[]>({objectMode: true});

    src.pipe(collector).pipe(dst);

    dst.on('finish', () => {
        tst.is(dst.get().length, 1);
        tst.deepEqual(
            dst.get(),
            [[
                { name: "1", type: "Number" },
                { name: "2", type: "Number" },
                { name: "3", type: "Number" },
                { name: "4", type: "Number" },
                { name: "5", type: "Number" }
            ]]
        );
        tst.end();
    });
});

test.cb('Can Scan', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers());

    let scan = new ScanTransform<Thing, { n: number }>(
        (acc, a: Thing, cb) => { cb(null, { n: acc.n + parseInt(a.name, 10) }); },
        { n: 2 },
        {objectMode: true}
    );

    let dst = new Outer<{n: number}>({objectMode: true});

    src.pipe(scan).pipe(dst);

    dst.on('finish', () => {
        tst.deepEqual(
            dst.get(),
            [
                { n: 3 },
                { n: 5 },
                { n: 8 },
                { n: 12 },
                { n: 17 }
            ]
        );
        tst.end();
    });
});


test('Can Flatten', function(tst) {

    let src: ArrayReadable<Thing[]> = new ArrayReadable([getThingLetters(), getThingNumbers()]);
    let flatten = new FlattenTransform<Thing>({objectMode: true});
    src.pipe(flatten);

    return streamDataCollector<Thing>(flatten)
        .then((result) => {
            tst.deepEqual(
                result,
                [
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
                ]
            );
        })
        .catch((e) => {
            throw e;
        });
});


test.cb('Can Map', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers());

    let map = new MapTransform<Thing, ThingNumber>((a: Thing, cb) => {
        cb(null, { name: parseInt(a.name, 10), type: a.type });
    }, {objectMode: true});

    let dst = new Outer<ThingNumber>({objectMode: true});

    src.pipe(map).pipe(dst);

    dst.on('finish', () => {
        tst.deepEqual(
            dst.get(),
            [
                { name: 1, type: "Number" },
                { name: 2, type: "Number" },
                { name: 3, type: "Number" },
                { name: 4, type: "Number" },
                { name: 5, type: "Number" }
            ]
        );
        tst.end();
    });
});

test.cb('Can First', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers());

    let sort = new FirstDuplex<Thing>({objectMode: true});

    let dst = new Outer<Thing>({objectMode: true});

    src.pipe(sort).pipe(dst);

    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [{ name: "1", type: "Number" }]);
        tst.end();
    });
});


test.cb('Can Final', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers());

    let sort = new FinalDuplex<Thing>({objectMode: true});

    let dst = new Outer<Thing>({objectMode: true});

    src.pipe(sort).pipe(dst);

    dst.on('finish', () => {
        tst.deepEqual(dst.get(), [{ name: "5", type: "Number" }]);
        tst.end();
    });
});


test.cb('Can Sort', function(tst) {

    let src: ArrayReadable<Thing> = new ArrayReadable(getThingNumbers().reverse());

    let sort = new SortDuplex<Thing>((a: Thing, b: Thing) => {
        return parseInt(a.name, 10) - parseInt(b.name, 10);
    }, {objectMode: true});

    let dst = new Outer<Thing>({objectMode: true});

    src.pipe(sort).pipe(dst);

    dst.on('finish', () => {
        tst.deepEqual(
            dst.get(),
            [
                { name: "1", type: "Number" },
                { name: "2", type: "Number" },
                { name: "3", type: "Number" },
                { name: "4", type: "Number" },
                { name: "5", type: "Number" }
            ]
        );
        tst.end();
    });
});



test('ParallelJoin extends Joiner', function(tst) {

    let leftSrc = new ArrayReadable([
            {n: 1, dir: 'left'},
            {n: 2, dir: 'left'},
            {n: 3, dir: 'left'}
        ]),
        rightSrc = new ArrayReadable([
            {n: 5, dir: 'right'},
            {n: 4, dir: 'right'},
            {n: 3, dir: 'right'}
        ]);

    let pj = new ParallelJoin({objectMode: true});
    leftSrc.pipe(pj.add({objectMode: true}));
    rightSrc.pipe(pj.add({objectMode: true}));


    return streamDataCollector(pj)
        .then((adds) => {
            tst.is(adds.length, 6);
            tst.deepEqual(
                adds.sort(({n: n1}, {n: n2}) => {
                    return n1 - n2;
                }),
                [
                    {n: 1, dir: 'left'},
                    {n: 2, dir: 'left'},
                    {n: 3, dir: 'left'},
                    {n: 3, dir: 'right'},
                    {n: 4, dir: 'right'},
                    {n: 5, dir: 'right'}
                ]
            );
        })
        .catch((e) => {
            throw e;
        });

});

test('RightAfterLeft extends Joiner', function(tst) {

    interface MJLeft { n: number; dir: 'left'; }
    interface MJRight { n: number; dir: 'right'; }
    interface MJAdd { n: number; }

    let mapper = (leftValues: MJLeft[], rightValue: MJRight, done: boolean): MJAdd[] => {
        let leftVal = leftValues
            .reduce((acc, lv: MJLeft) => { return acc + lv.n; }, 0);

        let v = rightValue.n + leftVal;
        if (v == 10) { return []; }

        if (done) { v = v + 0.5; }

        return [{n: v}];
    };

    let leftSrc = new ArrayReadable([
            {n: 1, dir: 'left'},
            {n: 2, dir: 'left'},
            {n: 3, dir: 'left'}
        ]),
        rightSrc = new ArrayReadable([
            {n: 5, dir: 'right'},
            {n: 4, dir: 'right'},
            {n: 3, dir: 'right'}
        ]),
        joiner = new RightAfterLeft(mapper);

    leftSrc.pipe(joiner.left);
    rightSrc.pipe(joiner.right);

    return streamDataCollector<MJAdd>(joiner)
        .then((adds) => {
            tst.deepEqual(adds, [{n: 11}, {n: 9.5}]);
            tst.is(joiner['rightBuffer'].length, 0);
            tst.is(joiner['leftBuffer'].length, 0);
        })
        .catch((e) => {
            throw e;
        });

});

test('_bufferArrayToLastMarkerArray', function(tst) {
    let a = _bufferArrayToLastMarkerArray<number>();
    tst.deepEqual([], a([1, 2]));
    tst.deepEqual([[1, false], [2, false]], a([3]));
    tst.deepEqual([[3, true]], a([null]));
    tst.deepEqual([], a([]));
    tst.deepEqual([], a([]));

    let b = _bufferArrayToLastMarkerArray<number>();
    tst.deepEqual([], b([1, 2]));
    tst.deepEqual([[1, false], [2, false]], b([3]));
    tst.deepEqual([[3, false], [4, false], [5, true]], b([4, 5, null]));
    tst.deepEqual([], b([]));
    tst.deepEqual([], b([]));
});

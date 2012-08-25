var jschema = require('../index'),
    testItems = {
        string: 'string',
        array: [1, 2, 3],
        object: { one: 'item' },
        number: 1.5,
        integer: 1,
        'boolean': false,
        buffer: new Buffer('buffer'),
        date: new Date(),
        'null': null
    },
    keys = Object.keys(testItems);

keys.forEach(function (key) {
    exports[key] = function (test) {
        var valid = jschema({ type: key });
        test.expect(9);
        keys.forEach(function (testKey) {
            valid.validate(testItems[testKey], function (err) {
                if (testKey === key || (key === 'number' && testKey === 'integer')) {
                    test.ok(!err);
                } else {
                    test.ok(err.count === 1);
                }
            });
        });
        test.done();
    };
});

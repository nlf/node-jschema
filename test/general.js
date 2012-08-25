var jschema = require('../index');

exports['can create a validator'] = function (test) {
    var schema = { },
        validator = jschema(schema);

    test.ok(validator && validator.validate);
    test.done();
};

/*
## jschema

---
jschema is a JSON schema validation library, written to follow the JSON-schema draft 03 spec as found at http://tools.ietf.org/html/draft-zyp-json-schema-03

It is not yet a complete implementation, missing things from the draft are:

* item tuple schemas: the ability to define an array of schemas to match against an array
* additionalItems: since item tuples aren't supported, this isn't really possible yet
* default/title/description: while you can put these in your schema, they only serve as comments since the values are not used anywhere
* format: see section 5.23 of the draft, none of this is implemented
* extends: to maintain simplicity, extends is not implemented. it's easy enough to define your schema as smaller bits of json and reuse what you need to
* id
* $ref
* $schema
* Hyper Schema

Everything else stated in the spec is at least mostly functional. Note that, currently, there is no test suite. That's something I intend to fix ASAP.

*/

// helper function to verify type of properties
validator.prototype._checkType = function (type, value, path) {
    var match = false,
        self = this;
    if (typeof type === 'object') {
        match = self._validateItem(value, path, type);
    } else {
        type = [].concat(type);
        var types = type.map(function (item) { if (typeof item === 'string') return item.toLowerCase(); });
        types.forEach(function (type) {
            if (type === 'array') {
                match = Array.isArray(value);
            } else if (type === 'buffer') {
                match = Buffer.isBuffer(value);
            } else if (type === 'date') {
                match = value instanceof Date;
            } else if (type === 'any') {
                match = true;
            } else if (type === 'null') {
                match = value === null;
            } else if (type === 'integer') {
                match = typeof value === 'number' && (parseFloat(value) == parseInt(value, 10));
            } else if (~['number', 'boolean', 'string'].indexOf(type)) {
                match = typeof value === type;
            } else if (type === 'object') {
                if (typeof value === type && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date) && value !== null) {
                    match = true;
                }
            }
        });
    }
    return match;
};

// the opposite of type, these are types that the property can not be
validator.prototype._checkDisallow = function (type, value, path) {
    return !this._checkType(type, value, path);
};

// helper function to crudely sort an object for comparison purposes
function _sort(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return item;
    }
    var result = [];
    Object.keys(item).sort().forEach(function (key) {
        result.push({ key: key, value: _sort(item[key]) });
    });
    return result;
}

// filter an array down to its unique values. another helper for comparison purposes.
function _uniques(array) {
    var seen = [];
    return array.filter(function (item) {
        var encoded = JSON.stringify(_sort(item));
        if (!~seen.indexOf(encoded)) {
            seen.push(encoded);
            return true;
        }
    });
}

// compare two objects, this is also pretty crude but works in most cases
function _compare(item1, item2) {
    return JSON.stringify(_sort(item1)) === JSON.stringify(_sort(item2));
}

// check an array to see if all of its values are unique
function _isUnique(array) {
    array = _sort(array);
    return JSON.stringify(array) === JSON.stringify(_uniques(array));
}

// small helper function to aid in building the 'path' string used in the validation function
function _makePath(orig, append) {
    if (orig === '') {
        return append;
    } else {
        return orig + '.' + append;
    }
}

// parse the 'path' string to retrieve the portion of the given schema it refers to
function _getSchema(schema, path) {
    if (!path || path === '') {
        return schema;
    } else {
        var pathArray = path.split('.');
        for (var i = 0; i < pathArray.length; i++) {
            schema = schema.properties[pathArray[i]];
        }
        return schema;
    }
}

// this is the main validation function, and where the majority of the spec is implemented
validator.prototype._validateItem = function (object, path, forceSchema) {
    var self = this,
        schema = forceSchema || _getSchema(this.schema, path),
        ret = true;

    // short helper function to build an error string, also sets return value to false for one-shot uses
    function _addError(path, error, expected, received) {
        var out = error;
        if (path) out = out + ' at ' + path;
        if (expected) out = out + ', expected: ' + expected;
        if (received) out = out + ', received: ' + received;
        self.errors.push(out);
        ret = false;
    }

    // first we iterate dependencies and verify the object contains each property
    if (schema.hasOwnProperty('dependencies')) {
        Object.keys(schema.dependencies).forEach(function (dep) {
            if (object.hasOwnProperty(dep)) {
                var deps = [].concat(schema.dependencies[dep]);
                deps.forEach(function (key) {
                    if (!~Object.keys(object).indexOf(key)) {
                        _addError(path, 'missing dependency of ' + dep, key);
                    }
                });
            }
        });
    }

    // pattern properties are a way to implement a schema based on a regex, i.e. 'h$': { schema } will apply to any property ending with the letter h
    if (schema.hasOwnProperty('patternProperties')) {
        Object.keys(object).forEach(function (key) {
            Object.keys(schema.patternProperties).forEach(function (pattern) {
                if (key.match(pattern)) {
                    self._validateItem(object[key], _makePath(path, key), schema.patternProperties[pattern]);
                }
            });
        });
    }

    // properties that are not specifically part of the schema are either denied altogether, or validated against the additionalProperties schema
    if (schema.hasOwnProperty('additionalProperties')) {
        Object.keys(object).forEach(function (key) {
            if (schema.properties && !(key in schema.properties)) {
                if (schema.hasOwnProperty('patternProperties') && key.match(schema.patternProperties)) return;
                if (schema.additionalProperties === false) {
                    _addError(path, 'invalid extra properties present');
                } else {
                    self._validateItem(object[key], _makePath(path, key), schema.additionalProperties);
                }
            }
        });
    }

    // if we have no actual object, but the schema states it's required, raise an error
    if (typeof object === 'undefined' || object === null) {
        if (schema.hasOwnProperty('required') && schema.required) {
            _addError(path, 'missing required value');
        }
    } else {
        // here we do checks for the array type
        var parse = true;
        if (Array.isArray(object)) {
            if (schema.hasOwnProperty('type')) {
                if (!self._checkType(schema.type, object))
                    _addError(path, 'invalid type', schema.type, typeof object);
            }
            if (schema.hasOwnProperty('minItems')) {
                if (object.length < schema.minItems)
                    _addError(path, 'minimum items exceeded', schema.minItems, object.length);
            }
            if (schema.hasOwnProperty('maxItems')) {
                if (object.length > schema.maxItems)
                    _addError(path, 'maximum items exceeded', schema.maxItems, object.length);
            }
            if (schema.hasOwnProperty('uniqueItems') && schema.uniqueItems) {
                if (!_isUnique(object))
                    _addError(path, 'duplicate array items found');
            }
            if (schema.hasOwnProperty('items')) {
                self._validateItem(object, path, schema.items); 
            } else {
                parse = false;
            }
        }

        // parse will be flagged as true unless we should not attempt to read the schema
        if (parse) {
            var checks = [].concat(object);
            checks.forEach(function (check) {
                // make sure the type is not in the disallow list
                if (schema.hasOwnProperty('disallow')) {
                    if (!self._checkDisallow(schema.disallow, check, path)) {
                        if (typeof schema.type !== 'object') {
                            _addError(path, 'disallowed type', schema.disallow, typeof check);
                        } else {
                            _addError(path, 'disallowed schema type', JSON.stringify(schema.disallow), check);
                        }
                    }
                }
                // and that it is in the type list
                if (schema.hasOwnProperty('type')) {
                    if (!self._checkType(schema.type, check, path)) {
                        if (typeof schema.type !== 'object') {
                            _addError(path, 'invalid type', schema.type, typeof check);
                        } else {
                            _addError(path, 'invalid schema type', JSON.stringify(schema.type), check);
                        }
                    }
                }
                // check for value in enum
                if (schema.hasOwnProperty('enum')) {
                    var found = false;
                    for (var i = 0; i < schema.enum.length; i++) {
                        if (_compare(schema.enum[i], check))
                            found = true;
                    }
                    if (!found)
                        _addError(path, 'value not in enum', JSON.stringify(schema.enum), check);
                }
                // number based checks
                if (typeof check === 'number') {
                    if (schema.hasOwnProperty('minimum')) {
                        if (schema.hasOwnProperty('exclusiveMinimum') && schema.exclusiveMinimum) {
                            if (check <= schema.minimum)
                                _addError(path, 'exclusive minimum value exceeded', schema.minimum + 1, check);
                        } else {
                            if (check < schema.minimum)
                                _addError(path, 'minimum value exceeded', schema.minimum, check);
                        }
                    }
                    if (schema.hasOwnProperty('maximum')) {
                        if (schema.hasOwnProperty('exclusiveMaximum') && schema.exclusiveMaximum) {
                            if (check >= schema.maximum)
                                _addError(path, 'exclusive maximum value exceeded', schema.maximum - 1, check);
                        } else {
                            if (check > schema.maximum)
                                _addError(path, 'maximum value exceeded', schema.maximum, check);
                        }
                    }
                    if (schema.hasOwnProperty('divisibleBy') && schema.divisibleBy !== 0) {
                        if (check % schema.divisibleBy !== 0)
                            _addError(path, 'value does not match divisibleBy', schema.divisibleBy, check);
                    }
                // string based checks
                } else if (typeof check === 'string') {
                    if (schema.hasOwnProperty('minLength')) {
                        if (check.length < schema.minLength)
                            _addError(path, 'minimum string length exceeded', schema.minLength, check.length);
                    }
                    if (schema.hasOwnProperty('maxLength')) {
                        if (check.length > schema.maxLength)
                            _addError(path, 'maximum string length exceeded', schema.maxLength, check.length);
                    }
                    if (schema.hasOwnProperty('pattern')) {
                        if (!check.match(schema.pattern))
                            _addError(path, 'string does not match pattern', schema.pattern, check);
                    }
                }
            });
        }
    }
    // if child properties are specified, recurse them
    if (schema.hasOwnProperty('properties')) {
        Object.keys(schema.properties).forEach(function (propertyName) {
            if (object && object.hasOwnProperty(propertyName)) {
                self._validateItem(object[propertyName], _makePath(path, propertyName));
            } else {
                self._validateItem(null, _makePath(path, propertyName));
            }
        });
    } 
    if (forceSchema) return ret;
};

// object initializing function
function validator(schema) {
    if (!(this instanceof validator)) return new validator(schema);
    this.schema = schema;
    this.errors = [];
}

// the function intended for direct use
validator.prototype.validate = function (obj, callback) {
    this.errors = [];
    this._validateItem(obj, '');
    if (!this.errors.length) {
        return callback();
    } else {
        return callback({ count: this.errors.length, errors: this.errors });
    }
};

module.exports = validator;

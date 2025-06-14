    const bcrypt = require('bcrypt');

    const password = 'password';
    const saltRounds = 10; // This should match the salt rounds used in your register endpoint

    bcrypt.hash(password, saltRounds, function(err, hash) {
        if (err) {
            console.error(err);
            return;
        }
        console.log('Generated hash for "password":');
        console.log(hash);
    });
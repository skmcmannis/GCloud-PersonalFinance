//Final Project
//Author: Shawn McMannis
//CS 493 Cloud Application Development
//Last mod date: 12/9/19

const express = require('express');
const app = express();
const path = require(`path`);
const bodyParser = require('body-parser');
const request = require('request');
const json2html = require('json-to-html');
const {Datastore} = require('@google-cloud/datastore');
const accounts = express.Router();
const auth = express.Router();
const transactions = express.Router();
const users = express.Router();
const {OAuth2Client} = require('google-auth-library');

const AUTH_API = "https://accounts.google.com/o/oauth2/v2/auth";
const REDIRECT = "https://mcmannis-final.appspot.com/auth";
const RESP_TYPE = "code";
const SCOPE = "profile email";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const USERS = "users";
const ACCOUNTS = "accounts";
const TRANSACTIONS = "transactions";
const APP_URL = "https://mcmannis-final.appspot.com/";
const PEOPLE_API = "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses"
const datastore = new Datastore();
const client = new OAuth2Client(process.env.CLIENT_ID);

var state;
var token_jwt;
var token_access;

app.use(bodyParser.json());

function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}

function accountSelfMiddleware(account){
    account.self = APP_URL + "accounts/" + account[Datastore.KEY].id;
    return account;
}

function userSelfMiddleware(user){
    user.self = APP_URL + "users/" + user[Datastore.KEY].id;
    return user;
}

function transactionSelfMiddleware(transaction){
    transaction.self = APP_URL + "transactions/" + transaction[Datastore.KEY].id;
    return transaction;
}

function getToken(token){
    var tokenArr = token.split(" ");
    if(tokenArr[0] == 'Bearer'){
        return tokenArr[1];
    }
    else{
        return 0;
    }
}

//Following function adapted from:
//https://stackoverflow.com/questions/21816595/how-to-generate-a-random-number-of-fixed-length-using-javascript
function getState(){
    var add = 1;
    var max = Math.pow(10, 10 + add);
    var min = max/10;
    var num = Math.floor( Math.random() * (max - min + 1) ) + min;

    return ("" + num).substring(add);
}

//The following regex function from: https://stackoverflow.com/questions/14313183/javascript-regex-how-do-i-check-if-the-string-is-ascii-only
function isASCII(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

async function verify(token) {
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID
    }).catch(console.error);

    if(ticket){
        const payload = ticket.getPayload();
        return payload['email'];
    }
    else{
        return undefined;
    }
}

//Model functions
function create_user(first_name, last_name, email){
    var q = datastore.createQuery(USERS).filter('email', '=', email);
	return datastore.runQuery(q).then( (entities) => {
        if(entities[0][0] != undefined){
            return entities[0][0][Datastore.KEY].id;
        }
        else{
            var key = datastore.key(USERS);
            const new_user = {"first_name": first_name, "last_name": last_name, "email": email};
            return datastore.save({"key":key, "data":new_user}).then( () => {return key.id});
        }
	});
}

function get_user(user_id){
    const key = datastore.key([USERS, datastore.int(user_id)]);
    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            entity.map(userSelfMiddleware);
            return entity.map(fromDatastore);
        }
        else{
            return null;
        }
	});
}

function get_users(req){
	var q = datastore.createQuery(USERS).limit(5);
    var t = datastore.createQuery(USERS);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(t).then( (records) => {
        const size = records[0].length;
        return datastore.runQuery(q).then( (entities) => {
            results.users = entities[0].map(fromDatastore);
            results.users = entities[0].map(userSelfMiddleware);
            if(entities[1].moreResults !== datastore.NO_MORE_RESULTS){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
                results.total_records_returned = size;
            }
            else{
                results.total_records_returned = size;
            }
            return results;
        });
    });
}

function get_user_accounts(req, owner, user_id){
var q = datastore.createQuery(ACCOUNTS).filter('owner', '=', owner).limit(5);
    var t = datastore.createQuery(ACCOUNTS).filter('owner', '=', owner);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(t).then( (records) => {
        const size = records[0].length;
        return datastore.runQuery(q).then( (entities) => {
            for(x in entities[0]){
                for(y in entities[0][x].transactions){
                    entities[0][x].transactions[y].self = APP_URL + "transactions/" + entities[0][x].transactions[y].id;
                }
            }
            results.accounts = entities[0].map(fromDatastore);
            results.accounts = entities[0].map(accountSelfMiddleware);
            if(entities[1].moreResults !== datastore.NO_MORE_RESULTS){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + user_id + "/accounts?cursor=" + entities[1].endCursor;
                results.total_records_returned = size;
            }
            else{
                results.total_records_returned = size;
            }
            return results;
        });
    });
}

function post_account(name, bank, acct_num, owner){
    var key = datastore.key(ACCOUNTS);
    const new_account = {"name": name, "bank": bank, "acct_num": acct_num, "transactions":[], "owner": owner};
    return datastore.save({"key":key, "data":new_account}).then( () => {return key});
}

function get_accounts(req){
var q = datastore.createQuery(ACCOUNTS).limit(5);
    var t = datastore.createQuery(ACCOUNTS);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(t).then( (records) => {
        const size = records[0].length;
        return datastore.runQuery(q).then( (entities) => {
            for(x in entities[0]){
                for(y in entities[0][x].transactions){
                    entities[0][x].transactions[y].self = APP_URL + "transactions/" + entities[0][x].transactions[y].id;
                }
            }
            results.accounts = entities[0].map(fromDatastore);
            results.accounts = entities[0].map(accountSelfMiddleware);
            if(entities[1].moreResults !== datastore.NO_MORE_RESULTS){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
                results.total_records_returned = size;
            }
            else{
                results.total_records_returned = size;
            }
            return results;
        });
    });
}

function get_account(account_id){
    const key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            for(x in entity[0].transactions){
                 entity[0].transactions[x].self = APP_URL + "transactions/" + entity[0].transactions[x].id;
            }
            entity.map(accountSelfMiddleware);
            return entity.map(fromDatastore);
        }
        else{
            return null;
        }
	});
}

function put_account(name, bank, acct_num, owner, account_id){
    var transaction_data = {account: {}};
    const account_key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    return datastore.get(account_key).then( (entity) => {
        if(entity[0] != undefined){
            if(entity[0].owner != owner){
                return -1;
            }
            else{
                const data = {"name": name, "bank": bank, "acct_num": acct_num, "owner": owner, "transactions": entity[0].transactions};
                return datastore.save({"key":account_key, "data":data}).then( () => {
                    for(x in data.transactions){
                        data.transactions[x].self = APP_URL + "transactions/" + data.transactions[x].id;
                        transaction_data.account.id = account_id;
                        transaction_data.account.name = name;
                        patch_transaction(transaction_data, owner, data.transactions[x].id);
                    }
                    data.id = account_key.id;
                    return data
                });
            }
        }
        else{
            return null;
        }
    });
}

function patch_account(data, owner, account_id){
    const key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    var transaction_data = {account: {}};
    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            if(entity[0].owner != owner){
                return -1;
            }
            else{
                if(!data.name){
                    data.name = entity[0].name;
                }
                if(!data.bank){
                    data.bank = entity[0].bank;
                }
                if(!data.acct_num){
                    data.acct_num = entity[0].acct_num;
                }
                data.owner = owner;
                if((data.transactions !== []) && entity[0].transactions){
                   data.transactions = entity[0].transactions;
                }

                return datastore.save({"key":key, "data":data}).then( () => {
                    for(x in data.transactions){
                        data.transactions[x].self = APP_URL + "transactions/" + data.transactions[x].id;
                        transaction_data.account.id = account_id;
                        transaction_data.account.name = data.name;
                        patch_transaction(transaction_data, owner, data.transactions[x].id);
                    }
                    return data
                });
            }
        }
        else{
            return null;
        }
    });
}

function assign_transaction(owner, account_id, transaction_id){
    const account_key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    const transaction_key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);
    return datastore.get(transaction_key).then( (transaction) => {
        return datastore.get(account_key).then( (account) =>{
            console.log(transaction[0]);
            console.log(account[0]);
            if(transaction[0] == undefined || account[0] == undefined){
                return 0;
            }
            else if(transaction[0].owner != owner || account[0].owner != owner){
                return -2;
            }
            else if(transaction[0].account){
                return -1;
            }
            else{
                const account_details = {id: account_key.id, name: account[0].name};
                const transaction_details = {id: transaction_key.id};

                const transaction_data = {payee: transaction[0].payee, account: account_details, date: transaction[0].date, amount: transaction[0].amount, owner: owner};
                datastore.save({
                    "key": transaction_key,
                    "data": transaction_data
                });

                const account_transactions = account[0].transactions;
                account_transactions.push(transaction_details);
                const account_data = {name: account[0].name, bank: account[0].bank, acct_num: account[0].acct_num, transactions: account_transactions, owner: owner};
                return datastore.save({
                    "key": account_key,
                    "data":account_data
                });
            }
        });
    });
}

function remove_transaction(owner, account_id, transaction_id){
    const account_key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    const transaction_key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);
    return datastore.get(transaction_key).then( (transaction) => {
        return datastore.get(account_key).then( (account) =>{
            if(transaction[0] == undefined || account[0] == undefined){
                return 0;
            }
            else if(transaction[0].owner != owner || account[0].owner != owner){
                return -2;
            }
            else if(!transaction[0].account || (transaction[0].account && (transaction[0].account.id != account_id))){
                return -1;
            }
            else{
                const transaction_details = {id: transaction_key.id};

                const transaction_data = {payee: transaction[0].payee, account: null, date: transaction[0].date, amount: transaction[0].amount, owner: owner};
                datastore.save({
                    "key": transaction_key,
                    "data": transaction_data
                });

                var account_transactions = account[0].transactions;
                for(x in account_transactions){
                    if(account_transactions[x].id == transaction_id){
                        account_transactions.splice(x, 1);
                    }
                }
                const account_data = {name: account[0].name, bank: account[0].bank, acct_num: account[0].acct_num, transactions: account_transactions, owner: owner};
                return datastore.save({
                    "key": account_key,
                    "data":account_data
                });
            }
        });
    });
}

function delete_account(owner, account_id){
    const key = datastore.key([ACCOUNTS, datastore.int(account_id)]);
    var data = {};
    return datastore.get(key).then( (account) => {
        if(account[0] != undefined){
            if(account[0].owner != owner){
                return -1;
            }
            else{
                for(x in account[0].transactions){
                    data.account = null;
                    patch_transaction(data, owner, account[0].transactions[x].id);
                }
                return datastore.delete(key);
            }
        }
        else{
            return null;
        }
    });
}

function post_transaction(payee, date, amount, owner){
    var key = datastore.key(TRANSACTIONS);
    const new_transaction = {"payee": payee, "date": date, "amount": amount, "account": null, "owner": owner};
    return datastore.save({"key":key, "data":new_transaction}).then( () => {return key});
}

function get_transactions(req){
var q = datastore.createQuery(TRANSACTIONS).limit(5);
    var t = datastore.createQuery(TRANSACTIONS);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(t).then( (records) => {
        const size = records[0].length;
        return datastore.runQuery(q).then( (entities) => {
            for(x in entities[0]){
                if(entities[0][x].account){
                    entities[0][x].account.self = APP_URL + "accounts/" + entities[0][x].account.id;
                }
            }
            results.transactions = entities[0].map(fromDatastore);
            results.transactions = entities[0].map(transactionSelfMiddleware);
            if(entities[1].moreResults !== datastore.NO_MORE_RESULTS){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
                results.total_records_returned = size;
            }
            else{
                results.total_records_returned = size;
            }
            return results;
        });
    });
}

function get_transaction(transaction_id){
    const key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);
    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            if(entity[0].account){
                entity[0].account.self = APP_URL + "accounts/" + entity[0].account.id;
            }
            entity.map(transactionSelfMiddleware);
            return entity.map(fromDatastore);
        }
        else{
            return null;
        }
	});
}

function put_transaction(payee, date, amount, owner, transaction_id){
    const key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);
    var account_data = null;

    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            if(entity[0].owner != owner){
                return -1;
            }
            else{
                if(entity[0].account){
                    account_data = {"name": entity[0].account.name, "id": entity[0].account.id};
                }
                const data = {"payee": payee, "date": date, "amount": amount, "account": account_data, "owner": owner};
                return datastore.save({"key":key, "data":data}).then( () => {
                    if(data.account){
                        data.account.self = APP_URL + "accounts/" + data.account.id;
                    }
                    data.id = key.id;
                    return data;
                });
            }
        }
        else{
            return null;
        }
    });
}

function patch_transaction(data, owner, transaction_id){
    const key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);

    return datastore.get(key).then( (entity) => {
        if(entity[0] != undefined){
            if(entity[0].owner != owner){
                return -1;
            }
            else{
                if(!data.payee){
                    data.payee = entity[0].payee;
                }
                if(!data.date){
                    data.date = entity[0].date;
                }
                if(!data.amount){
                    data.amount = entity[0].amount;
                }
                data.owner = owner;

                if((data.account === undefined) && entity[0].account){
                    data.account = {"name": entity[0].account.name, "id": entity[0].account.id};
                }
                else if(data.account === undefined){
                    data.account = null;
                }

                return datastore.save({"key":key, "data":data}).then( () => {
                    if(data.account){
                        data.account.self = APP_URL + "accounts/" + data.account.id;
                    }
                    data.id = key.id;
                    return data;
                });
            }
        }
        else{
            return null;
        }
    });
}

function delete_transaction(owner, transaction_id){
    const transaction_key = datastore.key([TRANSACTIONS, datastore.int(transaction_id)]);
    return datastore.get(transaction_key).then( (transaction) => {
        if(transaction[0] != undefined){
            if(transaction[0].owner != owner){
                return -1;
            }
            else{
                if(transaction[0].account){
                    const account_key = datastore.key([ACCOUNTS, datastore.int(transaction[0].account.id)]);
                    datastore.get(account_key).then( (account) => {
                        var account_transactions = account[0].transactions;
                        for(x in account_transactions){
                            if(account_transactions[x].id == transaction_id){
                                account_transactions.splice(x, 1);
                            }
                        }
                        const data = {"name": account[0].name, "bank": account[0].bank, "acct_num": account[0].acct_num, "transactions": account_transactions, "owner": owner};
                        datastore.save({
                            "key": account_key,
                            "data": data
                        });
                    });
                }
                return datastore.delete(transaction_key);
            }
        }
        else{
            return null;
        }
    });
}


//Controller functions
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/welcome.html'));
});

auth.get('/', (req, response) => {
    if(req.headers.referer == 'https://mcmannis-final.appspot.com/'){
        state = getState();
        response.redirect(AUTH_API + "?scope=" + SCOPE + "&redirect_uri=" + REDIRECT + "&client_id=" + process.env.CLIENT_ID + "&response_type=" + RESP_TYPE + "&state=" + state);
    }
    else if(req.query.state == state){
        const TOK_URL = TOKEN_URI + "?code=" + req.query.code + "&client_id=" + process.env.CLIENT_ID + "&client_secret=" + process.env.CLIENT_SECRET + "&redirect_uri=" + REDIRECT + "&grant_type=authorization_code";
        request.post(TOK_URL, (error, res, body1) => {
            if(error){
                console.error(error);
            }
            else{
                    var obj1 = JSON.parse(body1);
                    token_access = obj1.access_token;
                    request.get(PEOPLE_API, {auth: {bearer: token_access}}, (error, res, body2) => {
                        if(error){
                            console.error(error);
                        }
                        else{
                            var obj2 = JSON.parse(body2);
                            const first_name = obj2.names[0].givenName;
                            const last_name = obj2.names[0].familyName;
                            const email = obj2.emailAddresses[0].value;
                            const user_id = create_user(first_name, last_name, email)
                            .then ( (user_id) => {
                                token_jwt = obj1.id_token;
                                var payload = {
                                    "User_id": user_id,
                                    "JWT": token_jwt
                                }
                                response.status(200).send(json2html(payload).slice(1,-1));
                            });
                        }
                    });
            }
        });
    }
});

users.get('/', function(req, res){
    var accepts = req.accepts(['application/json']);
    const users = get_users(req)
    .then ( (users) => {
        if(!accepts){
            res.status(406).send("Not acceptable");
        }
        else{
            res.status(200).json(users);
        }
    });
});

users.get('/:user_id', function(req, res){
    var accepts = req.accepts(['application/json']);
    const user = get_user(req.params.user_id)
    .then ( (user) => {
        if(user){
            if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else{
                res.status(200).json(user[0]);
            }
        }
        else{
            res.status(404).send("No user with this user_id exists");
        }
    });
});

users.get('/:user_id/accounts', function(req, res){
    var accepts = req.accepts('application/json');
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else{
                const user = get_user(req.params.user_id)
                .then( (user) => {
                    if(!user){
                        res.status(404).send("No user with this user_id exists");
                    }
                    else if(user[0].email == owner){
                        const accounts = get_user_accounts(req, owner, req.params.user_id)
                        .then( (accounts) => {
                            res.status(200).json(accounts);
                        });
                    }
                    else{
                        res.status(403).send("User_id does not match authentication token");
                    }
                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.post('/', function(req, res){
    var name_length = 0;
    var accepts = req.accepts('application/json');

    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(req.body.name){
                name_length = req.body.name.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(name_length < 2 || name_length > 20 || (req.body.name && !isASCII(req.body.name))){
                res.status(400).send("The name attribute is invalid");
            }
            else if(req.body.name && req.body.bank && req.body.acct_num){
                post_account(req.body.name, req.body.bank, req.body.acct_num, owner)
                .then(key => {
                    if(key){
                        res.location(APP_URL + "accounts/" + key.id);
                        res.status(201).json({ id: key.id, name: req.body.name, bank: req.body.bank, acct_num: req.body.acct_num, transactions: [], owner: owner, self: APP_URL + "accounts/" + key.id });
                    }
                });
            }
            else{
                res.status(400).send("The request object is missing at least one of the required attributes");
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.get('/', function(req, res){
    var accepts = req.accepts(['application/json']);
    const accounts = get_accounts(req)
	.then( (accounts) => {
        if(!accepts){
            res.status(406).send("Not acceptable");
        }
        else{
            res.status(200).json(accounts);
        }
    });
});

accounts.get('/:account_id', function(req, res){
    var accepts = req.accepts(['application/json']);
    const account = get_account(req.params.account_id)
    .then ( (account) => {
        if(account){
            if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else{
                res.status(200).json(account[0]);
            }
        }
        else{
            res.status(404).send("No account with this account_id exists");
        }
    });
});

accounts.put('/:account_id', function(req, res){
    var name_length = 0;
    var accepts = req.accepts('application/json');

    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(req.body.name){
                name_length = req.body.name.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(name_length < 2 || name_length > 20 || (req.body.name && !isASCII(req.body.name))){
                res.status(400).send("The name attribute is invalid");
            }
            else if(req.body.name && req.body.bank && req.body.acct_num){
                put_account(req.body.name, req.body.bank, req.body.acct_num, owner, req.params.account_id)
                .then(data => {
                    if(data && data != -1){
                        res.location(APP_URL + "accounts/" + data.id);
                        res.status(201).json({ id: data.id, name: req.body.name, bank: req.body.bank, acct_num: req.body.acct_num, transactions: data.transactions, owner: owner, self: APP_URL + "accounts/" + data.id });
                    }
                    else if(data == -1){
                        res.status(403).send("Account owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No account with this account_id exists");
                    }
                });
            }
            else{
                res.status(400).send("The request object is missing at least one of the required attributes");
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.patch('/:account_id', function(req, res){
    var name_length = 0;
    var accepts = req.accepts('application/json');
    var data = {};
    if(req.body.name){
        data.name = req.body.name;
    }
    if(req.body.bank){
        data.bank = req.body.bank;
    }
    if(req.body.acct_num){
        data.acct_num = req.body.acct_num;
    }
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(data.name){
                name_length = req.body.name.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(data.name && (name_length < 2 || name_length > 20 || !isASCII(data.name))){
                res.status(400).send("The name attribute is invalid");
            }
            else{
                patch_account(data, owner, req.params.account_id)
                .then(account => {
                    if(account && account != -1){
                        res.location(APP_URL + "accounts/" + req.params.account_id);
                        res.status(201).json({ id: req.params.account_id, name: account.name, bank: account.bank, acct_num: account.acct_num, transactions: account.transactions, owner: owner, self: APP_URL + "accounts/" + req.params.account_id });
                    }
                    else if(account == -1){
                        res.status(403).send("Account owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No account with this account_id exists");
                    }
                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.patch('/:account_id/transactions/:transaction_id', function(req, res){
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else{
                const status = assign_transaction(owner, req.params.account_id, req.params.transaction_id)
                .then ( (status) => {
                    if(status == -1){
                        res.status(403).send("This transaction is already assigned to an account");
                    }
                    else if(status == -2){
                        res.status(403).send("Account owner and/or transaction owner does not match authentication token");
                    }
                    else if(status == 0){
                        res.status(404).send("The specified account and/or transaction do not exist");
                    }
                    else{
                        res.status(204).end();
                    }
                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.delete('/:account_id/transactions/:transaction_id', function(req, res){
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else{
                const status = remove_transaction(owner, req.params.account_id, req.params.transaction_id)
                .then ( (status) => {
                    if(status == -1){
                        res.status(403).send("This transaction is not assigned to this account");
                    }
                    else if(status == -2){
                        res.status(403).send("Account owner and/or transaction owner does not match authentication token");
                    }
                    else if(status == 0){
                        res.status(404).send("The specified account and/or transaction do not exist");
                    }
                    else{
                        res.status(204).end();
                    }
                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

accounts.delete('/:account_id', function(req, res){
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else{
                delete_account(owner, req.params.account_id)
                .then( (key) => {
                    if(key && key != -1){
                        res.status(204).end();
                    }
                    else if(key == -1){
                        res.status(403).send("Account owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No account with this account_id exists");
                    }

                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
})

transactions.post('/', function(req, res){
    var payee_length = 0;
    var accepts = req.accepts('application/json');

    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(req.body.payee){
                payee_length = req.body.payee.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(payee_length < 2 || payee_length > 60 || (req.body.payee && !isASCII(req.body.payee))){
                res.status(400).send("The payee attribute is invalid");
            }
            else if(req.body.payee && req.body.date && req.body.amount){
                post_transaction(req.body.payee, req.body.date, req.body.amount, owner)
                .then(key => {
                    if(key){
                        res.location(APP_URL + "transactions/" + key.id);
                        res.status(201).json({ id: key.id, payee: req.body.payee, date: req.body.date, amount: req.body.amount, account: null, owner: owner, self: APP_URL + "transactions/" + key.id });
                    }
                });
            }
            else{
                res.status(400).send("The request object is missing at least one of the required attributes");
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

transactions.get('/', function(req, res){
    var accepts = req.accepts(['application/json']);
    const transactions = get_transactions(req)
	.then( (transactions) => {
        if(!accepts){
            res.status(406).send("Not acceptable");
        }
        else{
            res.status(200).json(transactions);
        }
    });
});

transactions.get('/:transaction_id', function(req, res){
    var accepts = req.accepts(['application/json']);
    const transaction = get_transaction(req.params.transaction_id)
    .then ( (transaction) => {
        if(transaction){
            if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else{
                res.status(200).json(transaction[0]);
            }
        }
        else{
            res.status(404).send("No transaction with this transaction_id exists");
        }
    });
});

transactions.put('/:transaction_id', function(req, res){
    var payee_length = 0;
    var accepts = req.accepts('application/json');

    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(req.body.payee){
                payee_length = req.body.payee.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(payee_length < 2 || payee_length > 20 || (req.body.payee && !isASCII(req.body.payee))){
                res.status(400).send("The payee attribute is invalid");
            }
            else if(req.body.payee && req.body.date && req.body.amount){
                put_transaction(req.body.payee, req.body.date, req.body.amount, owner, req.params.transaction_id)
                .then(data => {
                    if(data && data != -1){
                        res.location(APP_URL + "transactions/" + data.id);
                        res.status(201).json({ id: data.id, payee: data.payee, date: data.date, amount: data.amount, account: data.account, owner: owner, self: APP_URL + "transactions/" + data.id });
                    }
                    else if(data == -1){
                        res.status(403).send("Transaction owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No transaction with this transaction_id exists");
                    }
                });
            }
            else{
                res.status(400).send("The request object is missing at least one of the required attributes");
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

transactions.patch('/:transaction_id', function(req, res){
    var payee_length = 0;
    var accepts = req.accepts('application/json');
    var data = {};
    if(req.body.payee){
        data.payee = req.body.payee;
    }
    if(req.body.date){
        data.date = req.body.date;
    }
    if(req.body.amount){
        data.amount = req.body.amount;
    }
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(data.payee){
                payee_length = req.body.payee.length;
            }

            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else if(req.get('content-type') !== 'application/json'){
                res.status(415).send("Server only accepts application/json data");
            }
            else if(!accepts){
                res.status(406).send("Not acceptable");
            }
            else if(data.payee && (payee_length < 2 || payee_length > 20 || !isASCII(data.payee))){
                res.status(400).send("The payee attribute is invalid");
            }
            else{
                patch_transaction(data, owner, req.params.transaction_id)
                .then(transaction => {
                    if(transaction && transaction != -1){
                        res.location(APP_URL + "transactions/" + req.params.transaction_id);
                        res.status(201).json({ id: data.id, payee: data.payee, date: data.date, amount: data.amount, account: data.account, owner: owner, self: APP_URL + "transactions/" + data.id });
                    }
                    else if(transaction == -1){
                        res.status(403).send("Transaction owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No transaction with this transaction_id exists");
                    }
                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
});

transactions.delete('/:transaction_id', function(req, res){
    var token = 0;
    if(req.headers.authorization){
        token = getToken(req.headers.authorization);
    }
    if(token != 0){
        verify(token).then( (owner) => {
            if(!owner){
                res.status(401).send("Unauthorized");
            }
            else{
                delete_transaction(owner, req.params.transaction_id)
                .then( (key) => {
                    if(key && key != -1){
                        res.status(204).end();
                    }
                    else if(key == -1){
                        res.status(403).send("Transaction owner does not match authentication token");
                    }
                    else{
                        res.status(404).send("No transaction with this transaction_id exists");
                    }

                });
            }
        });
    }
    else{
        res.status(401).send("Unauthorized: Invalid token type or missing token");
    }
})

//HTTP 405 handlers
users.all('/', (req, res, next) => {
    res.set("Allow", "GET");
    res.status(405).send("Method not allowed");
});

users.all('/:user_id', (req, res, next) => {
    res.set("Allow", "GET");
    res.status(405).send("Method not allowed");
});

users.all('/:user_id/accounts', (req, res, next) => {
    res.set("Allow", "GET");
    res.status(405).send("Method not allowed");
});

accounts.all('/', (req, res, next) => {
    res.set("Allow", "GET, POST");
    res.status(405).send("Method not allowed");
});

accounts.all('/:account_id', (req, res, next) => {
    res.set("Allow", "DELETE, GET, PATCH, POST, PUT");
    res.status(405).send("Method not allowed");
});

accounts.all('/:account_id/transactions/:transaction_id', (req, res, next) => {
    res.set("Allow", "DELETE, PATCH");
    res.status(405).send("Method not allowed");
});

transactions.all('/', (req, res, next) => {
    res.set("Allow", "GET, POST");
    res.status(405).send("Method not allowed");
});

transactions.all('/:transaction_id', (req, res, next) => {
    res.set("Allow", "DELETE, GET, PATCH, POST, PUT");
    res.status(405).send("Method not allowed");
});

app.use('/accounts', accounts);
app.use('/auth', auth);
app.use('/transactions', transactions);
app.use('/users', users);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
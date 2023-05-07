require("./utils.js");

require('dotenv').config();
const express = require('express'); 
const session = require('express-session'); 
const MongoStore = require('connect-mongo');
// Input validation
const Joi = require("joi"); 
const bcrypt = require('bcrypt');
const saltRounds = 12;

const app = express();  

app.use(express.urlencoded({extended: false}));

const expireTime = 1 * 60 * 60 * 1000; //expires after 1 day  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/test`,
  crypto: {
		secret: mongodb_session_secret
	}
});

app.use(session({ 
      secret: node_session_secret,
      store: mongoStore, //default is memory store 
      saveUninitialized: false, 
      resave: true
  }
  ));

const port = process.env.PORT || 8080;


app.get('/', (req, res) => {
    var notLoggedIn = (`
    <form action="/login">
    <button type="submit">Log In</button>
    </form>
    <form action="/signup">
    <button type="submit">Sign Up</button>
    </form>
  `);

  if (!req.session.authenticated) {
    res.send(notLoggedIn);
  } else {
    var loggedIn = `
    <h1>Hello ${req.session.name}</h1>
    <br>
    <form action="/members">
    <button type="submit">Visit Member's Section</button>
    </form>
    <form action="/logout">
    <button type="submit">Log Out</button>
    </form>
    `;
    res.send(loggedIn);
  } 
});

app.get('/signup', (req,res) => {
  var html = `
    Create your user here
    <br>
    <form action='/submitUser' method='post'>
    <input name='name' type='text' placeholder='username' required>
    <br>
    <input name ='email' type='text' placeholder='email' required>
    <br>
    <input name='password' type='password' placeholder='password' required>
    <br>
    <button>Submit</button>
    </form>
    ${req.query.blank === 'true' ? 'Field is blank. Retry.' :''}
    ${req.query.invalid === 'true' ? 'Field is not valid. Retry.' :''}
  `;
  res.send(html);
});

app.post('/submitUser', async (req,res) => {
  var name = req.body.name;
  var email = req.body.email;
  var password = req.body.password;
  
  if(email == "" || password == "" || name == "") {
    res.redirect("/signUp?blank=true");
    return;
  }

  const schema = Joi.object(
    {
      name: Joi.string().regex(/^[a-zA-Z ]+$/).max(20).required(),
      email: Joi.string().email().max(50).required(),
      password: Joi.string().max(20).required()
    }
  );

  const validationResult = schema.validate({name, email, password});

  if (validationResult.error != null) {
    console.log("Validation error: ", validationResult.error.details[0].message);
    res.redirect("/signUp?invalid=true");
    return;
  }

  var hashedPassword = await bcrypt.hashSync(password, saltRounds);

  await userCollection.insertOne({name: name, email: email, password: hashedPassword});

  req.session.authenticated = true;
  req.session.email = email;
  req.session.cookie.maxAge = expireTime;
  req.session.name = name;

  res.redirect('/members');
});

app.get('/login', (req,res) => {
var html = `
log in
    <form action='/loggingin' method='post'>
    <input name='name' type='text' placeholder='username' required>
    <br>
    <input name='password' type='password' placeholder='password'required>
    <br>
    <button>Submit</button>
    </form>
    ${req.query.incorrect === 'true' ? 'Wrong User value..' :''}
    ${req.query.incorrectPass === 'true' ? 'Wrong Password.' :''}
    ${req.query.blank === 'true' ? 'Field is blank.' :''}
    ${req.query.invalid === 'true' ? 'Format is not valid.' :''}
    ${req.query.notLoggedIn === 'true' ? 'You must log in.' :''}
`;
  res.send(html);
});

app.get('/members', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login?notLoggedIn=true');
    return;
  }

  function getRandomNumber() {
    return Math.floor(Math.random() * 3) + 1;
  }  
const rNum = getRandomNumber();
  
const slothCarousel = '/sloth' + rNum + '.gif';

  var html = `
      <h1>Hello ${req.session.name}</h1>
      <img src=${slothCarousel} style='width:250px;'>
      <form action="/">
      <button type="submit">Return Home</button>
      </form>
      <form action="/logout">
      <button type="submit">Log Out</button>
      </form>
  `;
  res.send(html);
});

app.post('/loggingin', async (req,res) => {
  var name = req.body.name;
  var password = req.body.password;

  if(name == "" || password == "") {
    res.redirect("/login?blank=true");
    return;
  }

  const schema = Joi.string().regex(/^[a-zA-Z ]+$/).max(20).required();
  const validationResult = schema.validate(name);
  if (validationResult.error != null) {
    res.redirect("/login?invalid=true");
    return;
  }

  const result = await userCollection.find({
    name: name
  }).project({name: 1, email: 1, password: 1, _id: 1}).toArray();
  console.log(result);

  if(result.length != 1) {
    res.redirect("/login?incorrect=true");
    return;
  }

  // check if password matches for the username found in the database
  if (await bcrypt.compare(password, result[0].password)) {
    console.log("correct password");
    req.session.authenticated = true;
    req.session.name = name;
    req.session.cookie.maxAge = expireTime;
    // This result check was not my idea, got help on that one. Great idea by the way.
    req.session.name = result[0].name; 
    res.redirect('/members');
  } else {
    //user and password combination not found
    res.redirect("/login?incorrectPass=true");
  }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
      var html = `
      You are logged out.
      <form action="/">
      <button type="submit">Return Home</button>
      </form>
      `;
    res.send(html);
  }); 

app.get('/sloth/:id', (req,res) => {

    var sloth = req.params.id;

    if (sloth == 1) {
        res.send("Enjoy: <img src='/flower.gif' style='width:250px;'>");
    }
    else if (sloth == 2) {
        res.send("Hmmmm...: <img src='/slothm.gif' style='width:250px;'>");
    }
    else {
        res.send("Yaaaaawn: <img src='/slothm.gif' style='width:250px;'>"+sloth);
    }
});


app.use(express.static(__dirname + "/public"));

// Below is a catch all that takes one to a 404 page. 
app.get("*", (req,res) => {
	res.status(404);
	res.send("Page not found - 404");
})

app.listen(port, () => {
    console.log(`Node application listening on port: ${port}`);
});
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
app.set("view engine", "ejs");


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
  res.render('index', { authenticated: req.session.authenticated, name: req.session.name });
});


function Admin(req) {
  console.log("User type:", req.session.user_type); // Debugging
  return req.session.user_type === 'admin';
}

function adminAuth(req, res, next) {
  if (!(Admin(req))) {
    console.log("Not an admin!"); // Debugging
    res.status(403);
    res.render("403", { error: "You are not authorized to be here." });
    return;
  } else {
    console.log("Is an admin!"); // Debugging
    next();
  }
}


app.get('/signup', (req,res) => {
  res.render('signup', { blank: req.query.blank, invalid: req.query.invalid });
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

 // Assuming a default user type of 'user'
const newUser = { name: name, email: email, password: hashedPassword, user_type: 'user' };
await userCollection.insertOne(newUser);

req.session.authenticated = true;
req.session.email = email;
req.session.cookie.maxAge = expireTime;
req.session.name = name;



  res.redirect('/members');
});

app.get('/login', (req,res) => {
  res.render('login', { incorrect: req.query.incorrect, incorrectPass: req.query.incorrectPass, blank: req.query.blank, invalid: req.query.invalid, notLoggedIn: req.query.notLoggedIn });
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

  res.render("members", { username: req.session.name });
});

app.get('/admin', adminAuth, async (req,res) => {
  const result = await userCollection.find().project({name: 1, email: 1, user_type: 1, _id: 1}).toArray();
  res.render("admin", {users: result});
});

app.post('/promoteUser', adminAuth, async(req, res) => {
  const userEmail = req.body.email; // assuming you have this value from the request body

  userCollection.updateOne(
    { email: userEmail },
    { $set: { user_type: "admin" } }
  );
  res.redirect('/admin');
});

app.post('/demoteUser', adminAuth, async(req, res) => {
  const userEmail = req.body.email; // assuming you have this value from the request body

  userCollection.updateOne(
    { email: userEmail },
    { $set: { user_type: "user" } }
  );
  res.redirect('/admin');
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
  }).project({name: 1, email: 1, password: 1, _id: 1, user_type: 1}).toArray();
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
    req.session.user_type = result[0].user_type;
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
  res.render('logout');
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
	res.render("404");
})

app.listen(port, () => {
    console.log(`Node application listening on port: ${port}`);
});
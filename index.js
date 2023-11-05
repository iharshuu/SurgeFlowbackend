const express = require('express');
const mongoose = require('mongoose');
const User = require('./Model/Usermodel');
const Post = require('./Model/Post');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const SECRET_KEY = process.env.SECRET_KEY;
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { extname } = require('path');

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const app = express();
const port = 5050;

// Set up CORS options
const corsOptions = {
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  optionsSuccessStatus: 204,
  credentials: true,
};

app.use(cors(corsOptions));

// Enable JSON request body parsing
app.use(express.json());

// Connect to your MongoDB database
mongoose.connect("mongodb+srv://harshalmten:harshu@cluster0.qx0jm8q.mongodb.net/threads?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Serve static files (images in this case)
app.use('/Uploads', express.static('Uploads'));

// Define a list of allowed image file extensions
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];

// Define a function to filter uploaded files based on their extension
const fileFilter = (req, file, cb) => {
  const fileExtension = extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(fileExtension)) {
    return cb(null, true);
  } else {
    return cb(new Error('Only specific image file types are allowed.'), false);
  }
};

// Create a Multer instance for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileExtension = extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + fileExtension);
  },
});

const upload = multer({ storage, fileFilter });

// Endpoint for user registration
app.post('/register', upload.single('file'), async (req, res) => {
  try {
    const { user, email, password } = req.body;
  
    
    if (!user || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    // Get the uploaded profile picture using Multer
    const profilePicture = req.file;

    if (!profilePicture) {
      res.status(400).json({ message: 'Profile picture is required.' });
      return;
    }

    // Upload the image to Cloudinary
    const result = await cloudinary.uploader.upload(profilePicture.path, {
      folder: 'profile_pictures',
    });

    // Check if the username or email is already in use
    let user1 = await User.findOne({ username: user });
    let email1 = await User.findOne({ email: email });

    if (user1 || email1) {
      res.status(400).json({ error: 'Username or email already in use.' });
      return;
    }

    // Hash the password
    const hash = await bcrypt.hash(password, 10);

    // Create a new User with the provided details, including the Cloudinary URL for the profile picture
    const newUser = new User({
      username: user,
      email,
      password: hash,
      profilePicture: result.secure_url,
    });

    // Save the new user in the database
    await newUser.save();

    // Respond with a success message
    res.status(200).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Implement Cloudinary uploads for posts similarly...


app.post('/login', async (req, res) => {
  const { user, password } = req.body;
  if (!user || !password){
    res.status(400).json({ message : "All fields are required" });
    return;
  }
  try {
    let exist = await User.findOne({ username: user });

    if (exist) {
      bcrypt.compare(password, exist.password, function (err, result) {
        if (result) {
          const token = jwt.sign(
            {
              exp: Math.floor(Date.now() / 1000) + 3600,
              data: exist._id,
            },
            `${SECRET_KEY}`
          );
          res.cookie('jwtToken', token, { httpOnly: true });
          res.status(200).json({ message: 'Logging successful', token });
        } else {
          res.status(400).json({ message: 'Wrong password' });
        }
      });
    } else {
      res.status(404).json({ message: 'No user found' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization.replace('Bearer ', '');
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);

    const user = await User.findOne({ _id: decodedToken.data });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      username: user.username,
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: 'Error fetching user data' });
  }
});

app.post('/createpost', upload.single('picture'), async (req, res) => {
  if(!req.file) {
    res.status(400).json({message : "Image is required"})
  }
  try {
    const { description, userId } = req.body;
    
    const picture = req.file;


    // Upload the image to Cloudinary
    const result = await cloudinary.uploader.upload(picture.path, {
      folder: 'post_pictures',
    });

    const newPost = new Post({
      user: userId,
      description,
      picture: result.secure_url, // Store the Cloudinary URL
      likes: [],
      comments: [],
    });

    await newPost.save();

    res.status(201).json({ message: 'Post created successfully', newPost });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Error creating post' });
  }
});

app.get('/allposts', async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({
        path: 'user',
        select: 'username profilePicture',
      });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching and sorting posts.' });
  }
});

app.get("/following" , async (req ,res)=>{
  const token = req.headers.authorization;
  try{
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;
    const orginalUser = await User.findOne({ _id: userId });
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({
        path: 'user',
        select: 'username profilePicture ',
      });
      
      const followUserIds =  orginalUser.follow.map(follow => follow.user.toString());
      const ogposts = posts.filter((posts)=> followUserIds.includes( posts.user._id.toString()))
      
  res.json(ogposts);
} catch (error) {
  res.status(500).json({ error: 'An error occurred while fetching and sorting posts.' });
}

})


app.use("/personpost/:id", async (req, res) => {
  const postid = req.params.id;
  const token = req.headers.authorization;

  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "user",
        select: "username profilePicture email"
      });
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;
    const orginalUser = await User.findOne({ _id: userId });
    const userpost = posts.filter((post) => post.user._id.toString() === postid);

    if (userpost.length > 0) {
      // Check if userpost._id is in orginalUser.follow
      const isFollowing = orginalUser.follow.some((followedUser) => followedUser.user.toString() === postid);

      if (isFollowing) {
        // If the user is being followed, you can add a flag to the response
        res.json({ userpost, isFollowing: true });
      } else {
        // If the user is not being followed, you can add a flag to the response
        res.json({ userpost, isFollowing: false });
      }
    } else {
      // If no matching posts were found, you can handle it here.
      // For example, send a 404 status code and an error message.
      res.status(404).json({ error: "No posts found for this user." });
    }
  } catch (error) {
    res.status(500).json({ error: "An error occurred while fetching and sorting posts." });
  }
});

app.post("/follow/:id", async (req, res) => {
  const personid = req.params.id;
  const token = req.headers.authorization;

  try {
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;
    const orginalUser = await User.findOne({ _id: userId });

    // Check if personid is in orginalUser.follow
    const isFollowing = orginalUser.follow.some((followedUser) => followedUser.user.toString() === personid);

    if (isFollowing) {
      // If personid is already in the follow list, remove it
      orginalUser.follow = orginalUser.follow.filter((followedUser) => followedUser.user.toString() !== personid);
    } else {
      // If personid is not in the follow list, add it
      orginalUser.follow.push({ user: personid });
    }

    // Save the updated orginalUser with the follow changes
    await orginalUser.save();

    // Respond based on whether the user is being followed or unfollowed
    if (isFollowing) {
      res.status(200).json({ message: "Unfollow action successful", isFollowing: false });
    } else {
      res.status(200).json({ message: "Follow action successful", isFollowing: true });
    }
  } catch (error) {
    res.status(500).json({ error: "An error occurred while following/unfollowing the user." });
  }
});


app.post('/like/:postId', async (req, res) => {
  const postId = req.params.postId;
  const token = req.headers.authorization.replace('Bearer ', '');

  try {
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in the token' });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const userLiked = post.likes.some((like) => like.user && like.user.toString() === userId);

    if (userLiked) {
      post.likes = post.likes.filter((like) => like.user && like.user.toString() !== userId);
      await post.save();
      res.status(200).json({ message: 'disliked', likesCount: post.likes.length });
    } else {
      post.likes.push({ user: userId });
      await post.save();
      res.status(200).json({ message: 'liked', likesCount: post.likes.length });
    }
  } catch (error) {
    console.error('Error liking/unliking the post:', error);
    res.status(500).json({ error: 'An error occurred while liking/unliking the post' });
  }
});


app.post('/comment/:postId', async (req, res) => {
  const postId = req.params.postId;
  const { comment, user_id } = req.body;
  const token = req.headers.authorization.replace('Bearer ', '');

  try {
    const post = await Post.findById(postId);
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;
    const user = await User.findOne({ _id: userId });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    console.log(user.username)
    // Adding a comment with user's username and text
    post.comments.push({ user: user.username, text: comment });

    await post.save();

    res.status(200).json({ message: 'Comment added successfully', comment });
  } catch (error) {
    console.error('Error adding a comment:', error);
    res.status(500).json({ error: 'An error occurred while adding a comment' });
  }
});
app.get('/delete/:id', async (req,res)=>{
  const postId = req.params.id;
  const token = req.headers.authorization;
  
  try{
    const post = await Post.findById(postId);
    const decodedToken = jwt.verify(token, `${SECRET_KEY}`);
    const userId = decodedToken.data;
    
    if(userId === post.user.toString()){
      post.deleteOne({_id:postId})
      res.status(200).json({message:"Deleted Succesfully"})
    }
    else{
      res.status(400).json({message:"sorry"})
    }
    
  }
  catch(err){
    console.log("err")
  }
})

app.get("/",(req,res)=>{
  res.send("you're in the server")
})
app.get("/test",(req,res)=>{
  res.send("testing")
})


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
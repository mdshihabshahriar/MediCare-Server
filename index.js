const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT || 5002; 

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const db = client.db("medicare");
    const doctorCollection = db.collection("doctors");
    const userCollection = db.collection("user");

    app.get('/doctors', async (req, res) => {
        const result = await doctorCollection.find().toArray()
        res.json(result)
    })

    app.get('/doctors/:userId', async (req, res) => {
      const { userId } = req.params;
      const result = await doctorCollection.findOne({ userId });
      res.json(result); 
    });

    app.put("/doctors/:userId", async (req, res) => {
      const { userId } = req.params;
      const updateData = req.body;

      await doctorCollection.updateOne(
        { userId },
        {
          $set: {
            ...updateData,
            userId,
          },
        },
        { upsert: true }
      );

      await userCollection.updateOne(
        {
          _id: new ObjectId(userId),
        },
        {
          $set: {
            photoUrl: updateData.photoUrl,
          },
        }
      );

      res.json({
        success: true,
      });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
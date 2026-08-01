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
    const sessionCollection = db.collection("session");

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.json(result);
    });

    app.get('/doctors', async (req, res) => {
      const result = await doctorCollection
        .aggregate([
          {
            $lookup: {
              from: "user",
              let: { uid: "$userId" },
              pipeline: [
                { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] } } },
              ],
              as: "userInfo",
            },
          },
          { $unwind: "$userInfo" },
          {
            $project: {
              userId: 1,
              specialty: 1,
              hospitalName: 1,
              qualifications: 1,
              experience: 1,
              consultationFee: 1,
              name: "$userInfo.name",
              email: "$userInfo.email",
              photoUrl: "$userInfo.photoUrl",
              verificationStatus: "$userInfo.verificationStatus",
            },
          },
        ])
        .toArray();
 
      res.json(result);
    });

    app.get('/doctors/:userId', async (req, res) => {
      const { userId } = req.params;
      const result = await doctorCollection.findOne({ userId });
      res.json(result); 
    });

    app.get('/admin/stats', async (req, res) => {
      const [totalUsers, totalDoctors, totalPatients, pendingVerifications] =
        await Promise.all([
          userCollection.countDocuments({}),
          userCollection.countDocuments({ role: "doctor" }),
          userCollection.countDocuments({ role: "patient" }),
          userCollection.countDocuments({ role: "doctor", verificationStatus: "pending" }),
        ]);
 
      res.json({
        totalUsers,
        totalDoctors,
        totalPatients,
        pendingVerifications,
      });
    });

    app.get('/admin/recent-activity', async (req, res) => {
      const recentUsers = await userCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .project({ name: 1, role: 1, createdAt: 1, verificationStatus: 1 })
        .toArray();
 
      const activity = recentUsers.map((u) => ({
        text:
          u.role === "doctor"
            ? `${u.name} requested doctor verification`
            : `New user ${u.name} registered as a ${u.role}`,
        createdAt: u.createdAt,
      }));
 
      res.json(activity);
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

    app.patch("/doctors/:userId/verification", async (req, res) => {
      const { userId } = req.params;
      const { status } = req.body; // "verified" | "rejected" | "pending"
 
      if (!["verified", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
 
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { verificationStatus: status } }
      );
 
      res.json({ success: true });
    });

    app.patch('/users/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; 
 
      if (!["active", "suspended"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
 
      await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      if (status === "suspended") {
        await sessionCollection.deleteMany({ userId: id });
      }
 
      res.json({ success: true });
    });

    app.delete('/users/:id', async (req, res) => {
      const { id } = req.params;
      await userCollection.deleteOne({ _id: new ObjectId(id) });
      await doctorCollection.deleteOne({ userId: id });
      await sessionCollection.deleteMany({ userId: id }); 
      res.json({ success: true });
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
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
    const appointmentCollection = db.collection("appointments");
    const sessionCollection = db.collection("session");
    const scheduleCollection = db.collection("schedule");
    const prescriptionCollection = db.collection("prescriptions");
    const reviewCollection = db.collection("reviews");

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.json(result);
    });

    app.get("/doctors", async (req, res) => {
  const { verifiedOnly } = req.query;

  const pipeline = [
    {
      $lookup: {
        from: "user",
        let: { uid: "$userId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [{ $toString: "$_id" }, "$$uid"],
              },
            },
          },
        ],
        as: "userInfo",
      },
    },
    {
      $unwind: "$userInfo",
    },
  ];

  if (verifiedOnly === "true") {
    pipeline.push({
      $match: {
        "userInfo.role": "doctor",
        "userInfo.verificationStatus": "verified",
      },
    });
  }

  pipeline.push({
    $project: {
      userId: 1,
      specialty: 1,
      hospitalName: 1,
      qualifications: 1,
      experience: 1,
      consultationFee: 1,
      rating: 1,

      name: "$userInfo.name",
      email: "$userInfo.email",
      photoUrl: "$userInfo.photoUrl",
      role: "$userInfo.role",
      verificationStatus: "$userInfo.verificationStatus",
    },
  });

  const result = await doctorCollection.aggregate(pipeline).toArray();

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

    app.get("/schedules/:doctorId", async(req,res)=>{

      const {doctorId}=req.params;

      const result=await scheduleCollection.find({
          doctorId,
          isAvailable:true
      }).toArray();

      res.json(result);

    });

    app.get("/appointments/patient/:patientId", async (req, res) => {
      const { patientId } = req.params;

      const result = await appointmentCollection
        .aggregate([
          {
            $match: {
              patientId,
            },
          },
          {
            $lookup: {
              from: "user",
              let: {
                doctorId: "$doctorId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        {
                          $toString: "$_id",
                        },
                        "$$doctorId",
                      ],
                    },
                  },
                },
              ],
              as: "doctorUser",
            },
          },
          {
            $unwind: "$doctorUser",
          },
          {
            $lookup: {
              from: "doctors",
              let: {
                doctorId: "$doctorId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$userId", "$$doctorId"],
                    },
                  },
                },
              ],
              as: "doctorProfile",
            },
          },
          {
            $unwind: {
              path: "$doctorProfile",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              doctor: {
                $mergeObjects: ["$doctorUser", "$doctorProfile"],
              },
            },
          },
          {
            $lookup: {
              from: "schedule",
              let: {
                scheduleId: "$scheduleId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [{ $toString: "$_id" }, "$$scheduleId"],
                    },
                  },
                },
              ],
              as: "schedule",
            },
          },
          {
            $unwind: {
              path: "$schedule",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "reviews",
              let: {
                appointmentId: { $toString: "$_id" },
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointmentId", "$$appointmentId"],
                    },
                  },
                },
              ],
              as: "review",
            },
          },
          {
            $addFields: {
              hasReview: {
                $gt: [{ $size: "$review" }, 0],
              },
            },
          },
          {
            $project: {
              doctorUser: 0,
              doctorProfile: 0,
            },
          },
        ])
        .toArray();

      res.json(result);
    });

    app.get("/appointments/doctor/:doctorId", async (req, res) => {
      const { doctorId } = req.params;

      const result = await appointmentCollection
        .aggregate([
          {
            $match: {
              doctorId,
            },
          },
          {
            $lookup: {
              from: "user",
              let: {
                patientId: "$patientId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        {
                          $toString: "$_id",
                        },
                        "$$patientId",
                      ],
                    },
                  },
                },
              ],
              as: "patient",
            },
          },
          {
            $unwind: "$patient",
          },
        ])
        .toArray();

      res.json(result);
    });

    app.get("/prescriptions/doctor/:doctorId", async (req, res) => {
      const { doctorId } = req.params;
 
      const result = await prescriptionCollection
        .find({ doctorId })
        .sort({ createdAt: -1 })
        .toArray();
 
      res.json(result);
    });

    app.get("/appointments/:id", async (req, res) => {
      const { id } = req.params;
 
      const result = await appointmentCollection
        .aggregate([
          { $match: { _id: new ObjectId(id) } },
          {
            $lookup: {
              from: "user",
              let: { patientId: "$patientId" },
              pipeline: [
                { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$patientId"] } } },
              ],
              as: "patient",
            },
          },
          { $unwind: "$patient" },
        ])
        .toArray();
 
      res.json(result[0] || null);
    });

    app.get("/doctors/:doctorId/stats", async (req, res) => {
      try {
        const { doctorId } = req.params;

        const patients = await appointmentCollection.aggregate([
          {
            $match: { doctorId },
          },
          {
            $group: {
              _id: "$patientId",
            },
          },
        ]).toArray();

        const upcomingAppointments =
          await appointmentCollection.countDocuments({
            doctorId,
            status: "accepted",
          });

        const reviews = await reviewCollection
          .find({ doctorId })
          .toArray();

        const reviewsReceived = reviews.length;

        const averageRating =
          reviewsReceived > 0
            ? (
                reviews.reduce((sum, r) => sum + Number(r.rating), 0) /
                reviewsReceived
              ).toFixed(1)
            : 0;

        res.json({
          totalPatients: patients.length,
          upcomingAppointments,
          reviewsReceived,
          averageRating,
        });
      } catch (err) {
        res.status(500).json({
          message: err.message,
        });
      }
    });

    app.get("/reviews/patient/:patientId", async (req, res) => {
      const { patientId } = req.params;

      const result = await reviewCollection
        .aggregate([
          {
            $match: { patientId },
          },
          {
            $lookup: {
              from: "user",
              let: {
                doctorId: "$doctorId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        { $toString: "$_id" },
                        "$$doctorId",
                      ],
                    },
                  },
                },
              ],
              as: "doctor",
            },
          },
          {
            $unwind: "$doctor",
          },
          {
            $project: {
              rating: 1,
              comment: 1,
              createdAt: 1,
              doctorId: 1,
              patientId: 1,
              doctorName: "$doctor.name",
              doctorPhoto: "$doctor.photoUrl",
            },
          },
        ])
        .toArray();

      res.json(result);
    });

    app.get("/reviews/doctor/:doctorId", async (req, res) => {
      const { doctorId } = req.params;

      const result = await reviewCollection.aggregate([
        {
          $match: {
            doctorId,
          },
        },
        {
          $lookup: {
            from: "user",
            let: {
              patientId: "$patientId",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: [
                      {
                        $toString: "$_id",
                      },
                      "$$patientId",
                    ],
                  },
                },
              },
            ],
            as: "patient",
          },
        },
        {
          $unwind: "$patient",
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $limit: 5,
        },
        {
          $project: {
            rating: 1,
            comment: 1,
            createdAt: 1,
            patientName: "$patient.name",
            patientPhoto: "$patient.photoUrl",
          },
        },
      ]).toArray();

      res.json(result);
    });

    app.get("/analytics/summary", async (req, res) => {
      const totalPatients = await userCollection.countDocuments({
        role: "patient",
      });

      const totalDoctors = await userCollection.countDocuments({
        role: "doctor",
        verificationStatus: "verified",
      });

      const totalAppointments =
        await appointmentCollection.countDocuments();

      res.json({
        totalPatients,
        totalDoctors,
        totalAppointments,
      });
    });

    app.get("/analytics/doctor-performance", async (req, res) => {

      const result = await doctorCollection
        .aggregate([
          {
            $lookup: {
              from: "user",
              let: { uid: "$userId" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] },
                  },
                },
              ],
              as: "user",
            },
          },
          { $unwind: "$user" },
          {
            $lookup: {
              from: "reviews",
              let: { docId: "$userId" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$doctorId", "$$docId"] },
                  },
                },
              ],
              as: "reviews",
            },
          },
          {
            $addFields: {
              averageRating: {
                $cond: [
                  { $gt: [{ $size: "$reviews" }, 0] },
                  { $round: [{ $avg: "$reviews.rating" }, 1] },
                  0,
                ],
              },
            },
          },
          {
            $project: {
              name: "$user.name",
              averageRating: 1,
            },
          },
          {
            $sort: { averageRating: -1 },
          },
          {
            $limit: 6,
          },
        ])
        .toArray();

      res.json(result);
    });

    app.get("/analytics/monthly-trend", async (req, res) => {

      const result = await appointmentCollection.aggregate([
        {
          $group: {
            _id: {
              month: {
                $month: "$createdAt",
              },
            },
            appointments: {
              $sum: 1,
            },
            patients: {
              $addToSet: "$patientId",
            },
          },
        },
        {
          $project: {
            month: "$_id.month",
            appointments: 1,
            patients: {
              $size: "$patients",
            },
          },
        },
        {
          $sort: {
            month: 1,
          },
        },
      ]).toArray();

      const months = [
        "",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      res.json(
        result.map((item) => ({
          month: months[item.month],
          patients: item.patients,
          appointments: item.appointments,
        }))
      );
    });

    app.post("/schedules", async (req,res)=>{
      const schedule=req.body;

      schedule.createdAt=new Date();
      schedule.updatedAt=new Date();
      schedule.isAvailable=true;

      const result=await scheduleCollection.insertOne(schedule);

      res.json(result);
    });

    app.post("/appointments", async (req, res) => {
      try {
        const appointment = req.body;

        if (
          !appointment.doctorId ||
          !appointment.patientId ||
          !appointment.scheduleId ||
          !appointment.appointmentDay ||
          !appointment.appointmentStartTime
        ) {
          return res.status(400).json({
            success: false,
            message: "Missing required appointment information",
          });
        }

        const doctor = await userCollection.findOne({
          _id: new ObjectId(appointment.doctorId),
        });

        if (!doctor) {
          return res.status(404).json({
            success: false,
            message: "Doctor not found.",
          });
        }

        appointment.doctorName = doctor.name;

        appointment.status = "pending";

        appointment.paymentStatus =
          appointment.paymentStatus || "pending";

        appointment.stripeSessionId =
          appointment.stripeSessionId || null;

        appointment.createdAt = new Date();
        appointment.updatedAt = new Date();

        const result = await appointmentCollection.insertOne(
          appointment
        );

        res.json({
          success: true,
          insertedId: result.insertedId,
        });

      } catch (error) {
        console.error("Appointment creation error:", error);

        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    app.post("/prescriptions", async (req, res) => {
      const prescription = req.body;
 
      prescription.createdAt = new Date();
      prescription.updatedAt = new Date();
 
      const result = await prescriptionCollection.insertOne(prescription);
 
      res.json(result);
    });

    app.post("/reviews", async (req, res) => {
      const {
        appointmentId,
        doctorId,
        patientId,
        rating,
        comment,
      } = req.body;

      const appointment = await appointmentCollection.findOne({
        _id: new ObjectId(appointmentId),
        doctorId,
        patientId,
        status: "completed",
      });

      if (!appointment) {
        return res.status(403).json({
          message: "You cannot review this doctor.",
        });
      }

      const exists = await reviewCollection.findOne({
        appointmentId,
      });

      if (exists) {
        return res.status(400).json({
          message: "Review already submitted.",
        });
      }

      const review = {
        appointmentId,
        doctorId,
        patientId,
        rating,
        comment,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await reviewCollection.insertOne(review);

      res.json({
        success: true,
        insertedId: result.insertedId.toString(),
      });
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

    app.patch("/schedules/:id",async(req,res)=>{

        const {id}=req.params;

        const data=req.body;

        const result=await scheduleCollection.updateOne(
            {_id:new ObjectId(id)},
            {
                $set:{
                    ...data,
                    updatedAt:new Date()
                }
            }
        )

        res.json(result);

    })

    app.patch("/appointments/:id/status", async (req, res) => {
      const { id } = req.params;

      const { status } = req.body;

      if (
        ![
          "pending",
          "accepted",
          "completed",
          "cancelled",
          "rejected",
        ].includes(status)
      ) {
        return res.status(400).json({
          error: "Invalid Status",
        });
      }

      const appointment = await appointmentCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res.status(404).json({
          error: "Appointment not found",
        });
      }

      const updateFields = { status, updatedAt: new Date() };

      if (status === "cancelled" && appointment.paymentStatus === "paid") {
        updateFields.paymentStatus = "refunded";
      }

      const result = await appointmentCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: updateFields,
        }
      );

      res.json({
        ...result,
        refunded: updateFields.paymentStatus === "refunded",
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

    app.patch("/prescriptions/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
 
      const result = await prescriptionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...data, updatedAt: new Date() } }
      );
 
      res.json(result);
    });

    app.patch("/reviews/:id", async (req, res) => {
      const { id } = req.params;

      const { rating, comment } = req.body;

      const result = await reviewCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            rating,
            comment,
            updatedAt: new Date(),
          },
        }
      );

      res.json(result);
    });

    app.patch("/appointments/:id/payment", async (req, res) => {
      try {
        const { id } = req.params;
        const { transactionId, paymentSessionId, amountPaid } = req.body;

        const result = await appointmentCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              paymentStatus: "paid",
              paymentMethod: "stripe",
              transactionId: transactionId || null,
              paymentSessionId: paymentSessionId || null,
              amountPaid: amountPaid || 0,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Appointment not found",
          });
        }

        res.json({
          success: true,
          message: "Appointment payment updated successfully",
        });
      } catch (error) {
        console.error("Update payment error:", error);

        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    app.delete('/users/:id', async (req, res) => {
      const { id } = req.params;
      await userCollection.deleteOne({ _id: new ObjectId(id) });
      await doctorCollection.deleteOne({ userId: id });
      await sessionCollection.deleteMany({ userId: id }); 
      res.json({ success: true });
    });

    app.delete("/schedules/:id",async(req,res)=>{

      const {id}=req.params;

      const result=await scheduleCollection.deleteOne({
          _id:new ObjectId(id)
      });

      res.json(result);

    });

    app.delete("/appointments/:id", async (req, res) => {
      const { id } = req.params;

      const result = await appointmentCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.delete("/reviews/:id", async (req, res) => {
      const { id } = req.params;

      const result = await reviewCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
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
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import dayjs from "dayjs";
import joi from "joi";

const participantSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message").required(),
});

const app = express();
app.use(cors());
app.use(express.json());

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

try {
  await mongoClient.connect();
  db = mongoClient.db("batepapo_uol_api");
} catch (err) {
  console.log(err);
}

function getHour() {
  const todayDate = new Date();
  const hour = dayjs(todayDate).format("HH:mm:ss");
  return hour;
}

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const { error } = participantSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }

  try {
    const userAlreadyExists = await db.collection("users").findOne({ name });

    if (userAlreadyExists) {
      res.status(409).send("User already exists!");
      return;
    }

    await db.collection("users").insertOne({
      name,
      lastStatus: Date.now(),
    });

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "Entra na sala...",
      type: "status",
      time: getHour(),
    });

    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participantsList = await db.collection("users").find().toArray();
    res.send(participantsList);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  if (!user) {
    res.status(400).send("Missing headers field!");
    return;
  }

  const userExists = await db.collection("users").findOne({ name: user });

  if (!userExists) {
    res.status(422).send("User doesn't exist!");
    return;
  }

  const { error } = messageSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }

  try {
    await db.collection("messages").insertOne({
      from: `${user}`,
      to,
      text,
      type,
      time: getHour(),
    });

    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const { user } = req.headers;
  const { limit } = req.query;

  if (!user) {
    res.status(400).send("Missing headers field!");
    return;
  }

  try {
    let messagesList = await db
      .collection("messages")
      .find({ $or: [{ from: `${user}` }, { to: `${user}` }, { to: "Todos" }, { type: "message" }] })
      .toArray();

    limit !== undefined ? (messagesList = messagesList.slice(-limit)) : null;

    res.send(messagesList);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const userStillOnline = await db.collection("users").findOne({ name: user });

    if (!userStillOnline) {
      res.sendStatus(404);
      return;
    }

    await db.collection("users").updateOne(
      { name: user },
      {
        $set: {
          lastStatus: Date.now(),
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

setInterval(async () => {
  const timeNow = Date.now();
  const users = await db.collection("users").find().toArray();

  users.forEach(async (user) => {
    const lastActivity = user.lastStatus;

    if (timeNow - lastActivity >= 10000) {
      await db.collection("users").deleteOne({ name: user.name });
      await db.collection("messages").insertOne({
        from: user.name,
        to: "Todos",
        text: "Sai da sala...",
        type: "status",
        time: getHour(),
      });
    }
  });
}, 15000);

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { user } = req.headers;

  try {
    const message = await db.collection("messages").findOne({ _id: ObjectId(id) });

    if (!message) {
      res.status(404).send("Couldn't find a message with this id!");
      return;
    }

    if (message.from !== user) {
      res.status(401).send("The user is not the owner of this message!");
      return;
    }

    await db.collection("messages").deleteOne({ _id: ObjectId(id) });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { to, text, type } = req.body;
  const { user } = req.headers;

  if (!user) {
    res.status(400).send("Missing headers field!");
    return;
  }

  const userExists = await db.collection("users").findOne({ name: user });

  if (!userExists) {
    res.status(422).send("User doesn't exist!");
    return;
  }

  const { error } = messageSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }

  try {
    const message = await db.collection("messages").findOne({ _id: ObjectId(id) });

    if (!message) {
      res.status(404).send("Couldn't find a message with this id!");
      return;
    }

    if (message.from !== user) {
      res.status(401).send("The user is not the owner of this message!");
      return;
    }

    await db.collection("messages").updateOne(
      { _id: ObjectId(id) },
      {
        $set: {
          to,
          text,
          type,
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.listen(5000, () => console.log("Server running in port: 5000"));

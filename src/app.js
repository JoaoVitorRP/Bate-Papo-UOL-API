import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import dayjs from "dayjs";

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

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const hour = dayjs().hour();
  const minute = dayjs().minute();
  const second = dayjs().second();

  try {
    await db.collection("users").insertOne({
      name,
      lastStatus: Date.now(),
    });

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "Entra na sala...",
      type: "status",
      time: `${hour}:${minute}:${second}`,
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participantsList = await db.collection("users").find().toArray();
    res.send(participantsList);
  } catch (err) {
    console.log(err);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const user = req.headers.user;

  const hour = dayjs().hour();
  const minute = dayjs().minute();
  const second = dayjs().second();

  if (!user) {
    res.status(400).send("Missing headers field!");
    return;
  }

  try {
    await db.collection("messages").insertOne({
      from: `${user}`,
      to,
      text,
      type,
      time: `${hour}:${minute}:${second}`,
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const limit = req.query.limit;

  if (!user) {
    res.status(400).send("Missing headers field!");
    return;
  }

  try {
    let messagesList = await db
      .collection("messages")
      .find({ $or: [{ from: `${user}` }, { to: "Todos" }, { to: `${user}` }] })
      .toArray();

    limit !== undefined ? (messagesList = messagesList.slice(-limit)) : null;

    res.send(messagesList);
  } catch (err) {
    console.log(err);
  }
});

app.listen(5000, () => console.log("Server running in port 5000"));

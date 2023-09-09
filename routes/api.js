'use strict';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const BoardModel = require('../models/models').Board;
const ThreadModel = require('../models/models').Thread;
const ReplyModel = require('../models/models').Reply;

const saltRounds = 13;

module.exports = function (app) {
  // Route for creating a new thread
  app.post('/api/threads/:board', async (req, res) => {
    try {
      const { text, delete_password } = req.body;
      let board = req.body.board;

      if (!board) {
        board = req.params.board;
      }

      const newThread = new ThreadModel({
        text: text,
        delete_password: bcrypt.hashSync(delete_password, saltRounds),
        created_on: new Date(),
        bumped_on: new Date(),
        reported: false,
        replies: [],
      });

      const boardData = await BoardModel.findOne({ name: board });

      if (!boardData) {
        const newBoard = new BoardModel({
          name: board,
          threads: [],
        });

        newBoard.threads.push(newThread);
        await newBoard.save();
      } else {
        boardData.threads.push(newThread);
        await boardData.save();
      }

      res.redirect('/'); // Redirect to a suitable URL after creating the thread
    } catch (err) {
      console.error(err);
      res.send("There was an error saving in post");
    }
  });
  app.get('/api/threads/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      // Sort threads by bumped_on date in descending order and limit to 10 threads
      const sortedThreads = board.threads
        .slice()
        .sort((a, b) => b.bumped_on - a.bumped_on)
        .slice(0, 10);

      // Process each thread to exclude reported and delete_password fields
      const processedThreads = sortedThreads.map((thread) => {
        const { _id, text, created_on, bumped_on, replies } = thread;

        // Sort replies by created_on date in ascending order and limit to 3 replies
        const sortedReplies = replies
          .slice()
          .sort((a, b) => a.created_on - b.created_on)
          .slice(0, 3);

        // Remove reported and delete_password fields from thread and replies
        const sanitizedReplies = sortedReplies.map((reply) => {
          const { _id, text, created_on } = reply;
          return { _id, text, created_on };
        });

        return {
          _id,
          text,
          created_on,
          bumped_on,
          replies: sanitizedReplies,
          replycount: replies.length,
        };
      });

      res.json(processedThreads);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });
  app.put('/api/threads/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const threadId = req.body.thread_id;

      if (!threadId) {
        res.status(400).json({ error: "Missing thread_id in request body" });
        return;
      }

      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      const thread = board.threads.id(threadId);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      // Mark the thread as reported
      thread.reported = true;
      await board.save();

      res.send("reported");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });

  app.delete('/api/threads/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const threadId = req.body.thread_id;
      const deletePassword = req.body.delete_password;

      if (!threadId || !deletePassword) {
        res.status(400).json({ error: "Missing thread_id or delete_password in request body" });
        return;
      }

      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      const thread = board.threads.id(threadId);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      // Verify delete_password using bcrypt
      const isPasswordValid = bcrypt.compareSync(deletePassword, thread.delete_password);

      if (!isPasswordValid) {
        res.send("incorrect password");
        return;
      }

      // Remove the thread from the board's threads array
      board.threads.pull(thread);
      await board.save();

      res.send("success");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });
  app.post('/api/replies/:board', async (req, res) => {
    try {
      const { text, delete_password, thread_id } = req.body;
      const board = req.params.board;

      // Find the board
      const boardData = await BoardModel.findOne({ name: board });

      if (!boardData) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      // Find the thread within the board
      const thread = boardData.threads.id(thread_id);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      // Create a new reply object
      const newReply = new ReplyModel({
        _id: new mongoose.Types.ObjectId(), // Use mongoose.Types.ObjectId() to create a new ObjectId
        text,
        created_on: new Date(),
        delete_password: bcrypt.hashSync(delete_password, saltRounds),
        reported: false,
      });

      // Add the reply to the thread's replies array
      thread.replies.push(newReply);

      // Update the bumped_on date to the reply's created_on date
      thread.bumped_on = newReply.created_on;

      // Save the board with the new reply
      await boardData.save();

      res.redirect(`/b/${board}/${thread_id}`); // Redirect to the thread page
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });
  app.get('/api/replies/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const threadId = req.query.thread_id;

      if (!threadId) {
        res.status(400).json({ error: "Missing thread_id in query parameters" });
        return;
      }

      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      const thread = board.threads.id(threadId);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      // Exclude specific fields from the thread and its replies
      const sanitizedThread = {
        _id: thread._id,
        text: thread.text,
        created_on: thread.created_on,
        bumped_on: thread.bumped_on,
        replies: thread.replies.map((reply) => ({
          _id: reply._id,
          text: reply.text,
          created_on: reply.created_on,
        })),
      };

      res.json(sanitizedThread);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });
  app.put('/api/replies/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const { thread_id, reply_id } = req.body;

      if (!thread_id || !reply_id) {
        res.status(400).json({ error: "Missing thread_id or reply_id in request body" });
        return;
      }

      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      const thread = board.threads.id(thread_id);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      const reply = thread.replies.id(reply_id);

      if (!reply) {
        res.status(404).json({ error: "Reply not found" });
        return;
      }

      // Mark the reply as reported
      reply.reported = true;

      await board.save();

      res.send("reported");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });
  app.delete('/api/replies/:board', async (req, res) => {
    try {
      const boardName = req.params.board;
      const { thread_id, reply_id, delete_password } = req.body;

      if (!thread_id || !reply_id || !delete_password) {
        res.status(400).json({ error: "Missing thread_id, reply_id, or delete_password in request body" });
        return;
      }

      const board = await BoardModel.findOne({ name: boardName });

      if (!board) {
        res.status(404).json({ error: "No board with this name" });
        return;
      }

      const thread = board.threads.id(thread_id);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      const reply = thread.replies.id(reply_id);

      if (!reply) {
        res.status(404).json({ error: "Reply not found" });
        return;
      }

      // Verify delete_password using bcrypt
      const isPasswordValid = bcrypt.compareSync(delete_password, reply.delete_password);

      if (!isPasswordValid) {
        res.send("incorrect password");
        return;
      }

      // Change the text of the reply to "[deleted]"
      reply.text = "[deleted]";

      await board.save();

      res.send("success");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred" });
    }
  });

};
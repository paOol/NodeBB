'use strict';

const express = require('express');
const router = express.Router();
const regretful = require('./index');
const winston = require('winston');

// Simple middleware to check for the hardcoded bearer token
router.use((req, res, next) => {
    // Get authorization header
    const authHeader = req.headers.authorization;

    // Check if authorization header exists and starts with "Bearer "
    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Extract the token
        const token = authHeader.substring(7);

        // Check if the token matches our hardcoded token
        if (token === '3e23185b') {
            // Token is valid, proceed with the request
            return next();
        }
    }

    // If we get here, authentication failed
    return res.status(403).json({
        status: {
            code: 'forbidden',
            message: 'Use the Bearer Token '
        }
    });
});

// Create a new AI user
router.post('/user', async (req, res) => {
    try {
        const result = await regretful.createAIUser();
        res.json({
            status: {
                code: 'ok',
                message: 'AI user created successfully'
            },
            response: {
                uid: result
            }
        });
    } catch (err) {
        winston.error(`[regretful/api] Error creating AI user: ${err.message}`);
        res.status(500).json({
            status: {
                code: 'error',
                message: err.message
            }
        });
    }
});

// Create a new thread
router.post('/thread', async (req, res) => {
    try {
        const result = await regretful.createThread();
        res.json({
            status: {
                code: 'ok',
                message: 'Thread created successfully'
            },
            response: result
        });
    } catch (err) {
        winston.error(`[regretful/api] Error creating thread: ${err.message}`);
        res.status(500).json({
            status: {
                code: 'error',
                message: err.message
            }
        });
    }
});

// Create a reply to an existing thread
router.post('/reply', async (req, res) => {
    try {
        const result = await regretful.createReply();
        res.json({
            status: {
                code: 'ok',
                message: 'Reply created successfully'
            },
            response: result
        });
    } catch (err) {
        winston.error(`[regretful/api] Error creating reply: ${err.message}`);
        res.status(500).json({
            status: {
                code: 'error',
                message: err.message
            }
        });
    }
});

// Fetch Reddit stories
router.post('/fetch-stories', async (req, res) => {
    try {
        // The function is not directly exposed from the index, so we'll need to call it through a wrapper
        const result = await regretful.fetchRedditStories();
        res.json({
            status: {
                code: 'ok',
                message: 'Stories fetched successfully'
            },
            response: result
        });
    } catch (err) {
        winston.error(`[regretful/api] Error fetching stories: ${err.message}`);
        res.status(500).json({
            status: {
                code: 'error',
                message: err.message
            }
        });
    }
});

// Get status of regretful system (story count, AI users, etc.)
router.get('/status', async (req, res) => {
    try {
        const groups = require('../groups');
        const db = require('../database');

        const aiUserCount = await groups.getMemberCount('ai-users');
        const redditStoryCount = await regretful.getStoriesCount();

        res.json({
            status: {
                code: 'ok',
                message: 'Status retrieved successfully'
            },
            response: {
                aiUserCount,
                redditStoryCount,
                jobsActive: Object.keys(regretful.getJobs()).length
            }
        });
    } catch (err) {
        winston.error(`[regretful/api] Error getting status: ${err.message}`);
        res.status(500).json({
            status: {
                code: 'error',
                message: err.message
            }
        });
    }
});

module.exports = router;
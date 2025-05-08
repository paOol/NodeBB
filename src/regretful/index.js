'use strict';

const winston = require('winston');
const cronJob = require('cron').CronJob;
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const _ = require('lodash');

const db = require('../database');
const user = require('../user');
const topics = require('../topics');
const posts = require('../posts');
const meta = require('../meta');
const privileges = require('../privileges');
const groups = require('../groups');
const utils = require('../utils');
const plugins = require('../plugins');

const Regretful = module.exports;

let jobs = {};

// Constants for subreddit data
const SUBREDDIT_URL = 'https://www.reddit.com/r/regretfulparents';

// Personality archetypes for AI users
const PERSONALITY_ARCHETYPES = [
    {
        type: 'remorseful',
        description: 'A parent who deeply regrets having children and struggles with guilt about these feelings.',
        traits: 'Sad, reflective, guilty, introspective, emotionally conflicted',
        writingStyle: 'Uses a lot of self-reflection and "I" statements. Often apologetic in tone. Writing has a melancholic quality.'
    },
    {
        type: 'overwhelmed',
        description: 'A parent who is completely exhausted and feels they made a mistake having children due to the constant demands.',
        traits: 'Tired, stressed, anxious, frustrated, at their limit',
        writingStyle: 'Short, abrupt sentences. Often uses phrases indicating exhaustion. Frequent mentions of lack of time and energy.'
    },
    {
        type: 'resentful',
        description: 'A parent who resents how children have changed their life and limited their opportunities.',
        traits: 'Bitter, envious of child-free friends, feels trapped, mourns lost potential',
        writingStyle: 'More negative language. Makes comparisons to life before kids or to others without children. Occasional rhetorical questions.'
    },
    {
        type: 'identity-loss',
        description: 'A parent who feels they have lost their sense of self after having children.',
        traits: 'Lost, confused, nostalgic for former self, searching for purpose',
        writingStyle: 'Reflective, often compares past and present. Uses phrases about "who I used to be" and "finding myself again".'
    },
    {
        type: 'sympathetic',
        description: 'A parent who has come to terms with regret but offers compassion to others struggling.',
        traits: 'Understanding, wise, balanced, emotionally mature, supportive',
        writingStyle: 'Validating language. Offers perspectives from both sides. Uses "we" and "us" to create connection. Shares personal experience as context for advice.'
    }
];

// Storage for reddit stories to use
let redditStories = [];

/**
 * Initialize jobs
 */
Regretful.init = function () {
    winston.verbose('[regretful/jobs] Initializing regretful parents jobs');
    
    // Fetch Reddit stories on initialization
    fetchRedditStories().catch(err => {
        winston.error(`[regretful] Error fetching Reddit stories: ${err.message}`);
    });

    // Create AI users - runs at 3:00 AM daily
    jobs.createAIUser = new cronJob('0 3 * * *', async function () {
        try {
            await Regretful.createAIUser();
        } catch (err) {
            winston.error(`[regretful] Error in createAIUser job: ${err.message}`);
            winston.error(err.stack);
        }
    }, null, true);

    // Create new threads - runs every 6 hours
    jobs.createThread = new cronJob('0 */6 * * *', async function () {
        try {
            await Regretful.createThread();
        } catch (err) {
            winston.error(`[regretful] Error in createThread job: ${err.message}`);
            winston.error(err.stack);
        }
    }, null, true);

    // Create replies - runs every 2 hours
    jobs.createReply = new cronJob('0 */2 * * *', async function () {
        try {
            await Regretful.createReply();
        } catch (err) {
            winston.error(`[regretful] Error in createReply job: ${err.message}`);
            winston.error(err.stack);
        }
    }, null, true);

    // Refresh Reddit stories - once a day at 2:00 AM
    jobs.refreshStories = new cronJob('0 2 * * *', async function () {
        try {
            await fetchRedditStories();
        } catch (err) {
            winston.error(`[regretful] Error in refreshStories job: ${err.message}`);
            winston.error(err.stack);
        }
    }, null, true);
};

/**
 * Stop all jobs
 */
Regretful.stopJobs = function () {
    winston.verbose('[regretful/jobs] Stopping jobs');
    
    Object.keys(jobs).forEach((jobId) => {
        if (jobs[jobId]) {
            jobs[jobId].stop();
        }
    });
    
    jobs = {};
};

/**
 * Create a new AI user with a regretful parent personality
 */
Regretful.createAIUser = async function () {
    winston.verbose('[regretful] Creating new AI user');
    
    // Generate a random username with a prefix
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const username = `parent_${randomSuffix}`;
    
    // Generate a random email
    const email = `${username}@ai-user.nodebb.org`;
    
    // Generate a secure random password
    const password = utils.generateUUID().slice(0, 16);
    
    // Select a random personality archetype
    const personality = PERSONALITY_ARCHETYPES[Math.floor(Math.random() * PERSONALITY_ARCHETYPES.length)];
    
    try {
        // Create the user
        const uid = await user.create({
            username: username,
            password: password,
            email: email
        });
        
        if (!uid) {
            throw new Error('User creation failed');
        }
        
        winston.verbose(`[regretful] Created AI user: ${username} (uid: ${uid})`);
        
        // Mark user as AI
        await db.setObjectField(`user:${uid}`, 'ai', true);
        
        // Save the personality
        await db.setObjectField(`user:${uid}`, 'aiPersonality', JSON.stringify(personality));
        
        // Add user to AI users group (create if doesn't exist)
        const groupExists = await groups.exists('ai-users');
        if (!groupExists) {
            await groups.create({
                name: 'ai-users',
                description: 'AI-generated users for simulation purposes',
                hidden: 1
            });
        }
        
        await groups.join('ai-users', uid);
        
        return uid;
    } catch (err) {
        winston.error(`[regretful] Error creating AI user: ${err.message}`);
        throw err;
    }
};

/**
 * Create a new thread from a random AI user
 */
Regretful.createThread = async function () {
    winston.verbose('[regretful] Creating new AI thread');
    
    try {
        // Get a random AI user
        const aiUser = await getRandomAIUser();
        
        if (!aiUser) {
            winston.verbose('[regretful] No AI users found, creating one before proceeding');
            const uid = await Regretful.createAIUser();
            if (!uid) {
                return;
            }
            const userData = await user.getUserData(uid);
            if (!userData) {
                return;
            }
            aiUser = userData;
        }
        
        // Get their personality
        const personality = JSON.parse(aiUser.aiPersonality || '{}');
        
        // Get story content from Reddit or generate one
        const story = getRandomStory();
        if (!story) {
            winston.verbose('[regretful] No stories available, fetching stories before proceeding');
            await fetchRedditStories();
            const newStory = getRandomStory();
            if (!newStory) {
                winston.warn('[regretful] Still no stories available after fetching, skipping thread creation');
                return;
            }
            story = newStory;
        }
        
        // Modify the title and content based on personality
        let title = story.title;
        let content = adaptContentToPersonality(story.content, personality);
        
        // Get a valid category for posting
        const categories = await getCategoriesWithPostPrivilege(aiUser.uid);
        if (!categories || !categories.length) {
            winston.warn('[regretful] No categories available for posting');
            return;
        }
        
        // Pick a random category
        const category = categories[Math.floor(Math.random() * categories.length)];
        
        // Create the topic
        const topicData = await topics.post({
            uid: aiUser.uid,
            cid: category.cid,
            title: title,
            content: content,
            tags: ['regret', 'parenting']
        });
        
        winston.verbose(`[regretful] Created new thread by ${aiUser.username} in category ${category.name}: "${title}" (tid: ${topicData.topicData.tid})`);
        
        return topicData;
    } catch (err) {
        winston.error(`[regretful] Error creating thread: ${err.message}`);
        throw err;
    }
};

/**
 * Create a reply to an existing thread from a random AI user
 */
Regretful.createReply = async function () {
    winston.verbose('[regretful] Creating new AI reply');
    
    try {
        // Get a random AI user
        const aiUser = await getRandomAIUser();
        
        if (!aiUser) {
            winston.verbose('[regretful] No AI users found, creating one before proceeding');
            const uid = await Regretful.createAIUser();
            if (!uid) {
                return;
            }
            const userData = await user.getUserData(uid);
            if (!userData) {
                return;
            }
            aiUser = userData;
        }
        
        // Get their personality
        const personality = JSON.parse(aiUser.aiPersonality || '{}');
        
        // Find a random topic that's not too old (< 7 days)
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentTopics = await getRecentTopics(oneWeekAgo);
        
        if (!recentTopics || !recentTopics.length) {
            winston.verbose('[regretful] No recent topics found, creating a new topic before replying');
            await Regretful.createThread();
            // Try again to get recent topics
            const newRecentTopics = await getRecentTopics(oneWeekAgo);
            if (!newRecentTopics || !newRecentTopics.length) {
                winston.warn('[regretful] Still no recent topics found after creating one, skipping reply creation');
                return;
            }
            recentTopics = newRecentTopics;
        }
        
        // Select a random topic
        const topic = recentTopics[Math.floor(Math.random() * recentTopics.length)];
        
        // Get the topic data for context
        const topicData = await topics.getTopicData(topic.tid);
        if (!topicData) {
            return;
        }
        
        // Get the main post to offer a response to it
        const mainPost = await posts.getPostData(topicData.mainPid);
        if (!mainPost) {
            return;
        }
        
        // Generate a sympathetic reply based on the personality
        const content = generateSympathyReply(mainPost.content, personality);
        
        // Create the reply
        const postData = await topics.reply({
            tid: topic.tid,
            uid: aiUser.uid,
            content: content
        });
        
        winston.verbose(`[regretful] Created new reply by ${aiUser.username} in topic "${topicData.title}" (pid: ${postData.pid})`);
        
        return postData;
    } catch (err) {
        winston.error(`[regretful] Error creating reply: ${err.message}`);
        throw err;
    }
};

/**
 * Fetch stories from r/regretfulparents
 */
async function fetchRedditStories() {
    try {
        winston.verbose('[regretful] Fetching stories from Reddit');
        
        const response = await fetch(`${SUBREDDIT_URL}/hot.json?limit=100`, {
            headers: {
                'User-Agent': 'NodeBB/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from Reddit: ${response.status}`);
        }
        
        const data = await response.json();
        const posts = data.data.children;
        
        const stories = [];
        for (const post of posts) {
            // Skip pinned posts, ads, and posts without much content
            if (post.data.stickied || 
                post.data.distinguished || 
                post.data.is_video ||
                post.data.selftext.length < 100 ||
                post.data.over_18) {
                continue;
            }
            
            stories.push({
                title: post.data.title,
                content: post.data.selftext,
                url: `https://www.reddit.com${post.data.permalink}`,
                score: post.data.score
            });
        }
        
        if (stories.length > 0) {
            redditStories = stories;
            winston.verbose(`[regretful] Fetched ${stories.length} stories from Reddit`);
        } else {
            winston.warn('[regretful] No suitable stories found from Reddit');
        }
        
        return stories;
    } catch (err) {
        winston.error(`[regretful] Error fetching Reddit stories: ${err.message}`);
        throw err;
    }
}

/**
 * Get a random AI user from the database
 */
async function getRandomAIUser() {
    try {
        // Get uids from the ai-users group
        const uids = await groups.getMembers('ai-users', 0, -1);
        
        if (!uids || !uids.length) {
            return null;
        }
        
        // Choose a random uid
        const randomUid = uids[Math.floor(Math.random() * uids.length)];
        
        // Get user data
        const userData = await user.getUserData(randomUid);
        
        return userData;
    } catch (err) {
        winston.error(`[regretful] Error getting random AI user: ${err.message}`);
        return null;
    }
}

/**
 * Get a random story from the collection
 */
function getRandomStory() {
    if (!redditStories || !redditStories.length) {
        return null;
    }
    
    return redditStories[Math.floor(Math.random() * redditStories.length)];
}

/**
 * Adapt content based on personality
 */
function adaptContentToPersonality(content, personality) {
    if (!personality || !personality.type) {
        return content;
    }
    
    let adaptedContent = content;
    
    // Add personal touches based on personality type
    switch (personality.type) {
        case 'remorseful':
            adaptedContent = `I feel so guilty writing this, but I need to get it off my chest.\n\n${content}\n\nI'm sorry for feeling this way. I love my children, but I can't help these feelings of regret.`;
            break;
        case 'overwhelmed':
            adaptedContent = `I'm at my breaking point. I can't do this anymore.\n\n${content}\n\nDoes it ever get better? I'm so exhausted all the time.`;
            break;
        case 'resentful':
            adaptedContent = `I watch my friends without kids living their best lives while I'm stuck in this life I never really wanted.\n\n${content}\n\nSometimes I wonder how different things would be if I hadn't become a parent.`;
            break;
        case 'identity-loss':
            adaptedContent = `I don't even recognize myself anymore. The person I used to be is gone.\n\n${content}\n\nI'm trying to find myself again, but it feels impossible with the constant demands of parenting.`;
            break;
        case 'sympathetic':
            adaptedContent = `I've been struggling with these feelings for a while, and I know others do too.\n\n${content}\n\nI think it's important we talk about these difficult feelings. It doesn't make us bad parents to acknowledge regret.`;
            break;
    }
    
    return adaptedContent;
}

/**
 * Generate a sympathetic reply based on the original post
 */
function generateSympathyReply(originalContent, personality) {
    if (!personality || !personality.type) {
        // Default sympathetic response
        return "I understand what you're going through. Parenting is incredibly difficult, and it's okay to have these feelings. You're not alone in this. Many of us struggle with similar regrets and challenges. Be kind to yourself.";
    }
    
    // Extract some keywords from the original content to make the reply more relevant
    const contentLower = originalContent.toLowerCase();
    const keywords = [];
    
    if (contentLower.includes('exhausted') || contentLower.includes('tired') || contentLower.includes('sleep')) {
        keywords.push('exhaustion');
    }
    if (contentLower.includes('career') || contentLower.includes('job') || contentLower.includes('work')) {
        keywords.push('career');
    }
    if (contentLower.includes('marriage') || contentLower.includes('husband') || contentLower.includes('wife') || 
        contentLower.includes('spouse') || contentLower.includes('partner')) {
        keywords.push('relationship');
    }
    if (contentLower.includes('money') || contentLower.includes('financial') || contentLower.includes('afford')) {
        keywords.push('financial');
    }
    if (contentLower.includes('alone') || contentLower.includes('lonely') || contentLower.includes('isolation')) {
        keywords.push('loneliness');
    }
    
    // Generate reply based on personality type and keywords
    switch (personality.type) {
        case 'remorseful':
            return generateRemorsefulReply(keywords);
        case 'overwhelmed':
            return generateOverwhelmedReply(keywords);
        case 'resentful':
            return generateResentfulReply(keywords);
        case 'identity-loss':
            return generateIdentityLossReply(keywords);
        case 'sympathetic':
            return generateSympatheticReply(keywords);
        default:
            return generateSympatheticReply(keywords);
    }
}

function generateRemorsefulReply(keywords) {
    const responses = [
        "I feel the same way, and the guilt is overwhelming. Every day I struggle with these feelings of regret, even though I try my best for my children. You're not alone in feeling this way.",
        "The shame I feel for having these regretful thoughts haunts me daily. Reading your post made me feel less alone. We're doing our best, even with these complicated feelings.",
        "I understand completely. The guilt I carry for wishing I hadn't become a parent is crushing. But I think there are many of us suffering in silence with these feelings."
    ];
    
    if (keywords.includes('exhaustion')) {
        responses.push("The constant exhaustion makes the regret so much worse. I lie awake feeling guilty about my feelings, which only makes me more tired. It's a vicious cycle I can't escape either.");
    }
    if (keywords.includes('career')) {
        responses.push("I mourn my career too. Every day I feel guilty both for resenting my children for my professional sacrifices and for having those resentful thoughts in the first place.");
    }
    if (keywords.includes('relationship')) {
        responses.push("My relationship has suffered too, and I feel responsible for all of it. If I hadn't pushed for children, maybe we would still be happy. The guilt from these thoughts is overwhelming.");
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateOverwhelmedReply(keywords) {
    const responses = [
        "I'm drowning too. Every. Single. Day. There's no break, no rest, just endless demands. I never knew parenting would be this relentless. I'm just trying to survive at this point.",
        "I haven't slept properly in years. I'm running on empty. My kids need more than I can give. I'm just so tired. All. The. Time. I get what you're going through.",
        "Can't remember the last time I had five minutes to myself. Always someone needing something. Always behind on everything. Always exhausted. I totally understand what you're feeling."
    ];
    
    if (keywords.includes('financial')) {
        responses.push("The financial stress is breaking me. Kids are so expensive. Daycare costs more than our mortgage. No money, no time, no energy. How are we supposed to do this??");
    }
    if (keywords.includes('loneliness')) {
        responses.push("I'm surrounded by people all day but completely alone. No adult conversation. No one to help. Just me and endless demands from tiny humans. It's suffocating.");
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateResentfulReply(keywords) {
    const responses = [
        "I see my friends without kids living the life I should have had. Traveling, advancing careers, pursuing passions. Meanwhile, I'm stuck in this never-ending cycle of needs and demands. I completely understand your resentment.",
        "I had such plans for my life. Goals. Dreams. Ambitions. None of those matter anymore. Everything revolves around the kids now. I look at child-free people with such envy sometimes.",
        "Why didn't anyone tell us the TRUTH about parenting? Everyone just talks about the kodak moments. Not the loss of freedom, identity, sleep, money, and sanity. I feel tricked into this life."
    ];
    
    if (keywords.includes('career')) {
        responses.push("My career has been completely derailed. Watching colleagues advance while I'm stuck changing diapers and handling tantrums. And we're supposed to be grateful for this sacrifice? I understand your frustration completely.");
    }
    if (keywords.includes('relationship')) {
        responses.push("My relationship is unrecognizable now. We used to be lovers and partners. Now we're just co-managers of an exhausting household. I miss who we used to be together, before kids changed everything.");
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateIdentityLossReply(keywords) {
    const responses = [
        "I don't even know who I am anymore besides 'mom/dad'. My whole identity has been erased. I used to be interesting, have hobbies, thoughts of my own. Now I'm just constantly catering to everyone else's needs.",
        "I look in the mirror sometimes and don't recognize the person staring back. Where did I go? When did I disappear? I'm lost beneath layers of parenting responsibilities.",
        "I wonder if I'll ever find myself again or if this is just who I am now. I miss the old me. The person with dreams and energy and a sense of purpose beyond parenting."
    ];
    
    if (keywords.includes('career')) {
        responses.push("My career was such a big part of who I was. I felt competent, respected, purposeful. Now my days are filled with mindless tasks that no one appreciates. I've lost that part of my identity completely.");
    }
    if (keywords.includes('loneliness')) {
        responses.push("The loneliness is profound because it's not just about being physically alone - it's about losing connection with your former self. I don't even remember what I used to enjoy or care about before kids consumed my entire identity.");
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateSympatheticReply(keywords) {
    const responses = [
        "What you're feeling is valid. Parenting is incredibly difficult, and society doesn't allow space for these complicated emotions. Be gentle with yourself - having these feelings doesn't make you a bad parent.",
        "I've been where you are, and while it doesn't necessarily get easier, you do develop better coping strategies with time. Your honesty is brave, and more parents should be able to express these difficult feelings.",
        "Parenting isn't all joy, and that's okay to admit. The expectations placed on parents are often unrealistic. You're doing better than you think, even on the days when you feel regret."
    ];
    
    if (keywords.includes('exhaustion')) {
        responses.push("The exhaustion of parenting is real and relentless. Make sure you're taking care of your basic needs too - you can't pour from an empty cup. Even small moments of rest can help manage these overwhelming feelings.");
    }
    if (keywords.includes('relationship')) {
        responses.push("Many relationships struggle under the weight of parenting. Try to find even 15 minutes to connect with your partner regularly. Remember you're on the same team, even when it doesn't feel like it.");
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Get categories where the user has posting privileges
 */
async function getCategoriesWithPostPrivilege(uid) {
    try {
        // Get all categories
        const categories = await categories.getAllCategories(uid);
        
        // Filter categories where user can post
        const filtered = [];
        for (const category of categories) {
            const canPost = await privileges.categories.can('topics:create', category.cid, uid);
            if (canPost) {
                filtered.push(category);
            }
        }
        
        return filtered;
    } catch (err) {
        winston.error(`[regretful] Error getting categories with post privilege: ${err.message}`);
        return [];
    }
}

/**
 * Get recent topics
 */
async function getRecentTopics(timestamp) {
    try {
        // Get recent topics
        const tids = await db.getSortedSetRangeByScore('topics:recent', 0, -1, timestamp, '+inf');
        if (!tids || !tids.length) {
            return [];
        }
        
        // Get topic data
        const topicsData = await topics.getTopicsData(tids);
        
        // Filter out deleted/invalid topics
        return topicsData.filter(t => t && !t.deleted);
    } catch (err) {
        winston.error(`[regretful] Error getting recent topics: ${err.message}`);
        return [];
    }
}
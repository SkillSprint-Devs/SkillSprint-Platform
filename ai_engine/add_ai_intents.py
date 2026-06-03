import json
import csv
import os

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INTENTS_PATH = os.path.join(_BASE_DIR, "dataset", "intents.json")
TRAIN_PATH = os.path.join(_BASE_DIR, "dataset", "train.csv")
VAL_PATH = os.path.join(_BASE_DIR, "dataset", "validation.csv")

# 1. Define the 5 new AI Mentor intents
ai_intents = {
    "platform.ai.ask": {
        "category": "AI Mentor",
        "response": "You can ask me questions about programming, SkillSprint platform features, or any errors you are facing. I'm here to help!",
        "route": "NONE",
        "keywords": ["ask", "question", "help", "mentor", "what can you do", "assist", "ai"],
        "admin_notes": "General capability inquiry.",
        "examples": [
            "what can you help me with",
            "can I ask you a programming question",
            "how do I use the ai mentor",
            "what do you do"
        ]
    },
    "platform.ai.feedback": {
        "category": "AI Mentor",
        "response": "If I give you an incorrect answer, you can click the thumbs down icon to log a failed query. Our team reviews these to improve my accuracy over time.",
        "route": "NONE",
        "keywords": ["feedback", "wrong", "incorrect", "report", "thumbs down", "bad answer", "fail"],
        "admin_notes": "Users reporting bad AI responses.",
        "examples": [
            "your answer was wrong",
            "how do I report a bad response",
            "you didn't answer my question correctly",
            "where do I leave feedback on this ai"
        ]
    },
    "platform.ai.history": {
        "category": "AI Mentor",
        "response": "Your recent conversation history is saved in your browser and will appear in the Recent Queries panel of the AI workspace.",
        "route": "NONE",
        "keywords": ["history", "previous chats", "old messages", "recent queries", "log", "conversation"],
        "admin_notes": "Session history is currently localStorage based.",
        "examples": [
            "where are my old chats",
            "how can I see my previous questions",
            "show me my chat history",
            "can I view past conversations"
        ]
    },
    "platform.ai.saved_queries": {
        "category": "AI Mentor",
        "response": "You can click the 'Bookmark' icon on any response to save it. Saved queries appear in the 'Saved' tab of the AI workspace for quick reference later.",
        "route": "NONE",
        "keywords": ["save", "bookmark", "saved queries", "keep", "favorite", "star"],
        "admin_notes": "Feature for bookmarking AI answers.",
        "examples": [
            "how do I save this answer",
            "can I bookmark your response",
            "where are my saved queries",
            "how to favorite a chat"
        ]
    },
    "platform.ai.capabilities": {
        "category": "AI Mentor",
        "response": "I can explain programming concepts (like closures or promises), guide you around the platform (like how to join a session), and help troubleshoot basic issues.",
        "route": "NONE",
        "keywords": ["capabilities", "features", "what else", "understand", "knowledge", "skills"],
        "admin_notes": "Explaining AI limits.",
        "examples": [
            "what are your capabilities",
            "what do you know",
            "what features do you support",
            "what kind of questions can you answer"
        ]
    }
}

# 2. Add to intents.json
with open(INTENTS_PATH, "r", encoding="utf-8") as f:
    intents = json.load(f)

for k, v in ai_intents.items():
    intents[k] = v

with open(INTENTS_PATH, "w", encoding="utf-8") as f:
    json.dump(intents, f, indent=2)

# 3. Generate dataset variations to reach ~30 train, ~5 val samples per intent
# Using a simple template expansion to generate unique variations.
templates = {
    "platform.ai.ask": [
        "can i {} you", "how to {} the ai", "what can you {}", "please {} me with this",
        "i need to {} a question", "is it possible to {} something", "i want to {} you"
    ],
    "platform.ai.feedback": [
        "this is {}", "you are {}", "how to report {}", "the answer is {}",
        "where to leave {} feedback", "why are you {}", "giving {} rating"
    ],
    "platform.ai.history": [
        "where is my {}", "show my {}", "how to view {}", "can i see my {}",
        "i lost my {}", "find my {}", "restore my {}"
    ],
    "platform.ai.saved_queries": [
        "how to {} this", "can i {} the answer", "where are {} located", "i want to {} it",
        "show me my {}", "i need to {} this chat", "list my {}"
    ],
    "platform.ai.capabilities": [
        "what are your {}", "tell me your {}", "list your {}", "do you have {}",
        "what {} do you possess", "explain your {}", "show me your {}"
    ]
}

fillers = {
    "platform.ai.ask": ["ask", "help", "assist", "query", "question", "consult"],
    "platform.ai.feedback": ["wrong", "incorrect", "bad", "terrible", "failing", "broken"],
    "platform.ai.history": ["history", "past chats", "old messages", "chat log", "conversation history"],
    "platform.ai.saved_queries": ["save", "bookmark", "saved queries", "favorites", "star"],
    "platform.ai.capabilities": ["capabilities", "skills", "features", "knowledge", "abilities"]
}

train_samples = []
val_samples = []

import random
random.seed(42)

for intent in ai_intents.keys():
    generated = set()
    t_list = templates[intent]
    f_list = fillers[intent]
    
    # generate exactly 30 unique
    while len(generated) < 30:
        t = random.choice(t_list)
        f = random.choice(f_list)
        sentence = t.replace("{}", f)
        generated.add(sentence)
        
    g_list = list(generated)
    random.shuffle(g_list)
    
    for s in g_list[:25]:
        train_samples.append({"intent": intent, "text": s})
    for s in g_list[25:]:
        val_samples.append({"intent": intent, "text": s})

# 4. Append to CSVs
with open(TRAIN_PATH, "a", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["intent", "text"])
    for row in train_samples:
        writer.writerow(row)
        
with open(VAL_PATH, "a", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["intent", "text"])
    for row in val_samples:
        writer.writerow(row)

print("AI Mentor intents generated and appended to datasets!")

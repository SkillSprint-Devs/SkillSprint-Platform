import json
import csv
import os
import random

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INTENTS_PATH = os.path.join(_BASE_DIR, "dataset", "intents.json")
TRAIN_PATH = os.path.join(_BASE_DIR, "dataset", "train.csv")
VAL_PATH = os.path.join(_BASE_DIR, "dataset", "validation.csv")

# 1. Clean up the bad rows (where intent starts with "i ", "how ", etc because they were swapped)
# Actually, the bad rows have intent in the text column.
# Let's just read and keep only rows where intent starts with "platform."
def fix_csv(path):
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    
    # Filter out the swapped ones
    good_rows = []
    for r in rows:
        # if the 'intent' field doesn't start with 'platform.', it's a messed up row
        if r["intent"].startswith("platform."):
            # wait, my bad script put intent in the first column, but the header is text,intent.
            # So the bad rows have text="platform.ai.something" and intent="how do I..."
            pass
        if r["text"].startswith("platform."):
            # this is a bad row, ignore it
            continue
        good_rows.append(r)
        
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in good_rows:
            writer.writerow(r)

fix_csv(TRAIN_PATH)
fix_csv(VAL_PATH)

# 2. Define the 5 new AI Mentor intents
ai_intents = [
    "platform.ai.ask", "platform.ai.feedback", "platform.ai.history", 
    "platform.ai.saved_queries", "platform.ai.capabilities"
]
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

random.seed(42)
for intent in ai_intents:
    generated = set()
    t_list = templates[intent]
    f_list = fillers[intent]
    
    while len(generated) < 30:
        t = random.choice(t_list)
        f = random.choice(f_list)
        sentence = t.replace("{}", f)
        generated.add(sentence)
        
    g_list = list(generated)
    random.shuffle(g_list)
    
    for s in g_list[:25]:
        train_samples.append({"text": s, "intent": intent})
    for s in g_list[25:]:
        val_samples.append({"text": s, "intent": intent})

# Append correctly
with open(TRAIN_PATH, "a", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["text", "intent"])
    for row in train_samples:
        writer.writerow(row)
        
with open(VAL_PATH, "a", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["text", "intent"])
    for row in val_samples:
        writer.writerow(row)

print("Fixed dataset generated!")

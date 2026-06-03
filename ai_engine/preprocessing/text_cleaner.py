"""
SkillSprint AI Engine — Text Preprocessing Pipeline
=====================================================
Cleans and normalizes raw user input before vectorization.

Pipeline:
  1. Lowercase
  2. Expand contractions  (can't → cannot)
  3. Fix common typos      (joim → join, wrking → working)
  4. Strip punctuation
  5. Tokenize
  6. Remove stopwords
  7. Lemmatize
  8. Rejoin

Usage:
    from preprocessing.text_cleaner import clean_text
    clean_text("How do I joim the meetng?")
    # → "join meeting"
"""

import re
import string

# ---------------------------------------------------------------------------
# Contraction map (common English contractions → expanded form)
# ---------------------------------------------------------------------------
CONTRACTIONS = {
    "can't":    "cannot",
    "cant":     "cannot",
    "won't":    "will not",
    "wont":     "will not",
    "don't":    "do not",
    "dont":     "do not",
    "doesn't":  "does not",
    "doesnt":   "does not",
    "didn't":   "did not",
    "didnt":    "did not",
    "isn't":    "is not",
    "isnt":     "is not",
    "aren't":   "are not",
    "arent":    "are not",
    "wasn't":   "was not",
    "wasnt":    "was not",
    "weren't":  "were not",
    "werent":   "were not",
    "hasn't":   "has not",
    "hasnt":    "has not",
    "haven't":  "have not",
    "havent":   "have not",
    "hadn't":   "had not",
    "hadnt":    "had not",
    "wouldn't": "would not",
    "wouldnt":  "would not",
    "shouldn't":"should not",
    "shouldnt": "should not",
    "couldn't": "could not",
    "couldnt":  "could not",
    "i'm":      "i am",
    "im":       "i am",
    "i've":     "i have",
    "ive":      "i have",
    "i'll":     "i will",
    "i'd":      "i would",
    "it's":     "it is",
    "that's":   "that is",
    "there's":  "there is",
    "what's":   "what is",
    "where's":  "where is",
    "who's":    "who is",
    "how's":    "how is",
    "let's":    "let us",
    "you're":   "you are",
    "they're":  "they are",
    "we're":    "we are",
    "you've":   "you have",
    "they've":  "they have",
    "we've":    "we have",
    "you'll":   "you will",
    "they'll":  "they will",
    "we'll":    "we will",
    "you'd":    "you would",
    "they'd":   "they would",
    "we'd":     "we would",
    "wanna":    "want to",
    "gonna":    "going to",
    "gotta":    "got to",
    "lemme":    "let me",
    "gimme":    "give me",
}

# ---------------------------------------------------------------------------
# Common typos seen in training data (extend as needed)
# ---------------------------------------------------------------------------
TYPO_MAP = {
    "joim":     "join",
    "jion":     "join",
    "joing":    "join",
    "wrking":   "working",
    "workin":   "working",
    "sesion":   "session",
    "sesiom":   "session",
    "meetng":   "meeting",
    "meating":  "meeting",
    "meetting": "meeting",
    "cam":      "camera",
    "mic":      "microphone",
    "btn":      "button",
    "acces":    "access",
    "accss":    "access",
    "prog":     "programming",
    "cert":     "certificate",
    "cretificate": "certificate",
    "notiification": "notification",
    "notif":    "notification",
    "collab":   "collaboration",
    "repo":     "repository",
    "dev":      "developer",
    "devs":     "developers",
    "config":   "configuration",
    "pls":      "please",
    "plz":      "please",
    "thx":      "thanks",
    "thnx":     "thanks",
    "ur":       "your",
    "u":        "you",
}

# ---------------------------------------------------------------------------
# Stopwords (lightweight — no NLTK dependency needed)
# ---------------------------------------------------------------------------
STOPWORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having",
    "do", "does", "did", "doing",
    "a", "an", "the",
    "and", "but", "if", "or", "because", "as", "until", "while",
    "of", "at", "by", "for", "with", "about", "against", "between",
    "through", "during", "before", "after", "above", "below",
    "to", "from", "up", "down", "in", "out", "on", "off",
    "over", "under", "again", "further", "then", "once",
    "here", "there", "when", "where", "why", "how",
    "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very",
    "can", "will", "just", "should",
    "now", "also", "please", "thanks",
}

# ---------------------------------------------------------------------------
# Simple suffix-based lemmatizer (no NLTK dependency)
# ---------------------------------------------------------------------------
IRREGULAR_LEMMAS = {
    "running":  "run",
    "locked":   "lock",
    "unlocked": "unlock",
    "unlocking": "unlock",
    "locking":  "lock",
    "crashed":  "crash",
    "crashing": "crash",
    "lagging":  "lag",
    "glitching":"glitch",
    "frozen":   "freeze",
    "broken":   "break",
    "denied":   "deny",
    "muted":    "mute",
    "saved":    "save",
    "paused":   "pause",
    "uploaded":  "upload",
    "downloaded":"download",
    "expired":  "expire",
    "scheduled":"schedule",
    "followed": "follow",
    "unfollowed":"unfollow",
    "commented":"comment",
    "deleted":  "delete",
    "created":  "create",
}


def _simple_lemma(word: str) -> str:
    """Best-effort lemmatization without external dependencies."""
    if word in IRREGULAR_LEMMAS:
        return IRREGULAR_LEMMAS[word]
    # -ing → base  (e.g. "joining" → "join")
    if word.endswith("ing") and len(word) > 5:
        stem = word[:-3]
        if stem.endswith(stem[-1]) and len(stem) > 2:   # "running" → "run"
            return stem[:-1]
        return stem
    # -ed → base  (e.g. "joined" → "join")
    if word.endswith("ed") and len(word) > 4:
        return word[:-2]
    # -ies → y  (e.g. "retries" → "retry")
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    # -es → base  (e.g. "quizzes" → "quiz")
    if word.endswith("es") and len(word) > 4:
        return word[:-2]
    # -s → base  (e.g. "sessions" → "session")
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


# ---------------------------------------------------------------------------
# Main cleaning function
# ---------------------------------------------------------------------------
def clean_text(text: str) -> str:
    """
    Full preprocessing pipeline.

    Args:
        text: Raw user input string

    Returns:
        Cleaned, normalized string ready for TF-IDF vectorization
    """
    if not text or not isinstance(text, str):
        return ""

    # 1. Lowercase
    text = text.lower().strip()

    # 2. Expand contractions
    for contraction, expanded in CONTRACTIONS.items():
        # Word-boundary replacement to avoid partial matches
        text = re.sub(r'\b' + re.escape(contraction) + r'\b', expanded, text)

    # 3. Fix common typos
    for typo, fix in TYPO_MAP.items():
        text = re.sub(r'\b' + re.escape(typo) + r'\b', fix, text)

    # 4. Strip punctuation (keep alphanumeric + spaces)
    text = re.sub(r'[^\w\s]', ' ', text)

    # 5. Tokenize
    tokens = text.split()

    # 6. Remove stopwords
    tokens = [t for t in tokens if t not in STOPWORDS]

    # 7. Lemmatize
    tokens = [_simple_lemma(t) for t in tokens]

    # 8. Remove empty / single-char noise tokens
    tokens = [t for t in tokens if len(t) > 1]

    return " ".join(tokens)


# ---------------------------------------------------------------------------
# Batch helper (for training data)
# ---------------------------------------------------------------------------
def clean_batch(texts: list) -> list:
    """Clean a list of texts."""
    return [clean_text(t) for t in texts]


# ---------------------------------------------------------------------------
# CLI test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    samples = [
        "How do I joim the meetng?",
        "i cant find the join btn",
        "where is my session histry?",
        "mic not wrking in live call",
        "how do i start a pair programming session",
        "why is the advanced quiz locked",
        "show me my badges plz",
        "cant login to my acces",
        "im trying to jion the video call",
    ]
    print("=" * 60)
    print("SkillSprint Text Cleaner — Sample Output")
    print("=" * 60)
    for s in samples:
        print(f"  IN:  {s}")
        print(f"  OUT: {clean_text(s)}")
        print()

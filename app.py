from flask import Flask, request, jsonify, send_from_directory
from gector.gec_model import GecBERTModel
from utils.helpers import get_target_sent_by_edits
import os
import re

app = Flask(__name__)

# 初始化模型
gec_model = GecBERTModel(
    vocab_path='data/output_vocabulary',            # 你的vocab路径
    model_paths=['models/roberta/roberta_1_gectorv2.th'],     # 你的模型路径
    weigths=[1.0],
    lowercase_tokens=True,
    iterations=1,
    min_error_probability=0.0
)

def get_char_index_range(matches, word_from, word_to):
    # 边界检查
    if word_from < 0 or word_to > len(matches) or word_from >= word_to:
        raise ValueError("Invalid word_from or word_to index")

    start_index = matches[word_from].start()
    end_index = matches[word_to - 1].end()

    return (start_index, end_index)

@app.route("/api/actions", methods=["POST"])
def get_actions():
    data = request.get_json()
    sentence = data.get("sentence", "").strip()

    pattern = re.compile(r"\w+|[^\w\s]", re.UNICODE)
    matches = list(pattern.finditer(sentence))
    tokens = [m.group() for m in matches]

    if not tokens:
        return jsonify({"original": sentence, "corrected": sentence, "actions": []})

    # 预测
    batch = [tokens]
    sequences = gec_model.preprocess(batch)
    probs, idxs, error_probs = gec_model.predict(sequences)

    # 提取动作
    edits, actions = gec_model.extract_edits(
        tokens=tokens,
        probabilities=probs[0],
        idxs=idxs[0],
        error_prob=error_probs[0]
    )
    for action in actions:
        token_start, token_end = get_char_index_range(matches, action['start'], action['end'])
        action['token_start'] = token_start
        action['token_end'] = token_end

    corrected_tokens = get_target_sent_by_edits(tokens, edits)

    return jsonify({
        "original": " ".join(tokens),
        "corrected": " ".join(corrected_tokens),
        "actions": actions
    })

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

if __name__ == "__main__":
    app.run(port=5000, debug=True)


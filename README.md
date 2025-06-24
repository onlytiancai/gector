# GECToR – Grammatical Error Correction: Tag, Not Rewrite

This repository provides code for training and testing state-of-the-art models for grammatical error correction with the official PyTorch implementation of the following paper:
> [GECToR – Grammatical Error Correction: Tag, Not Rewrite](https://aclanthology.org/2020.bea-1.16/) <br>
> [Kostiantyn Omelianchuk](https://github.com/komelianchuk), [Vitaliy Atrasevych](https://github.com/atrasevych), [Artem Chernodub](https://github.com/achernodub), [Oleksandr Skurzhanskyi](https://github.com/skurzhanskyi) <br>
> Grammarly <br>
> [15th Workshop on Innovative Use of NLP for Building Educational Applications (co-located with ACL 2020)](https://sig-edu.org/bea/2020) <br>

It is mainly based on `AllenNLP` and `transformers`.
## Installation
The following command installs all necessary packages:
```.bash
pip install -r requirements.txt
```
The project was tested using Python 3.7.

## Datasets
All the public GEC datasets used in the paper can be downloaded from [here](https://www.cl.cam.ac.uk/research/nl/bea2019st/#data).<br>
Synthetically created datasets can be generated/downloaded [here](https://github.com/awasthiabhijeet/PIE/tree/master/errorify).<br>
To train the model data has to be preprocessed and converted to special format with the command:
```.bash
python utils/preprocess_data.py -s SOURCE -t TARGET -o OUTPUT_FILE
```
## Pretrained models
<table>
  <tr>
    <th>Pretrained encoder</th>
    <th>Confidence bias</th>
    <th>Min error prob</th>
    <th>CoNNL-2014 (test)</th>
    <th>BEA-2019 (test)</th>
  </tr>
  <tr>
    <td>BERT <a href="https://grammarly-nlp-data-public.s3.amazonaws.com/gector/bert_0_gectorv2.th">[link]</a></td>
    <td>0.1</td>
    <td>0.41</td>
    <td>61.0</td>
    <td>68.0</td>
  </tr>
  <tr>
    <td>RoBERTa <a href="https://grammarly-nlp-data-public.s3.amazonaws.com/gector/roberta_1_gectorv2.th">[link]</a></td>
    <td>0.2</td>
    <td>0.5</td>
    <td>64.0</td>
    <td>71.8</td>
  </tr>
  <tr>
    <td>XLNet <a href="https://grammarly-nlp-data-public.s3.amazonaws.com/gector/xlnet_0_gectorv2.th">[link]</a></td>
    <td>0.2</td>
    <td>0.5</td>
    <td>63.2</td>
    <td>71.2</td>
  </tr>
</table>

**Note**: The scores in the table are different from the paper's ones, as the later version of transformers is used. To reproduce the results reported in the paper, use [this version](https://github.com/grammarly/gector/tree/fea1532608) of the repository. 

## Train model
To train the model, simply run:
```.bash
python train.py --train_set TRAIN_SET --dev_set DEV_SET \
                --model_dir MODEL_DIR
```
There are a lot of parameters to specify among them:
- `cold_steps_count` the number of epochs where we train only last linear layer
- `transformer_model {bert,distilbert,gpt2,roberta,transformerxl,xlnet,albert}` model encoder
- `tn_prob` probability of getting sentences with no errors; helps to balance precision/recall
- `pieces_per_token` maximum number of subwords per token; helps not to get CUDA out of memory

In our experiments we had 98/2 train/dev split.

## Training parameters
We described all parameters that we use for training and evaluating [here](https://github.com/grammarly/gector/blob/master/docs/training_parameters.md). 
<br>

## Model inference
To run your model on the input file use the following command:
```.bash
python predict.py --model_path MODEL_PATH [MODEL_PATH ...] \
                  --vocab_path VOCAB_PATH --input_file INPUT_FILE \
                  --output_file OUTPUT_FILE
```
Among parameters:
- `min_error_probability` - minimum error probability (as in the paper)
- `additional_confidence` - confidence bias (as in the paper)
- `special_tokens_fix` to reproduce some reported results of pretrained models

For evaluation use [M^2Scorer](https://github.com/nusnlp/m2scorer) and [ERRANT](https://github.com/chrisjbryant/errant).

## Text Simplification
This repository also implements the code of the following paper:
> [Text Simplification by Tagging](https://aclanthology.org/2021.bea-1.2/) <br>
> [Kostiantyn Omelianchuk](https://github.com/komelianchuk), [Vipul Raheja](https://github.com/vipulraheja), [Oleksandr Skurzhanskyi](https://github.com/skurzhanskyi) <br>
> Grammarly <br>
> [16th Workshop on Innovative Use of NLP for Building Educational Applications (co-located w EACL 2021)](https://sig-edu.org/bea/current) <br>

For data preprocessing, training and testing the same interface as for GEC could be used. For both training and evaluation stages `utils/filter_brackets.py` is used to remove noise. During inference, we use `--normalize` flag.

<table>
  <tr>
    <th></th>
    <th colspan="2">SARI</th>
    <th rowspan="2">FKGL</th>
  </tr>
    <th>Model</th>
    <th>TurkCorpus</th>
    <th>ASSET</th>
  </tr>
  <tr>
    <td>TST-FINAL <a href="https://grammarly-nlp-data-public.s3.amazonaws.com/gector/roberta_1_tst.th">[link]</a></td>
    <td>39.9</td>
    <td>40.3</td>
    <td>7.65</td>
  </tr>
  <tr>
    <td>TST-FINAL + tweaks</td>
    <td>41.0</td>
    <td>42.7</td>
    <td>7.61</td>
  </tr>
</table>

Inference tweaks parameters: <br>
```
iteration_count = 2
additional_keep_confidence = -0.68
additional_del_confidence = -0.84
min_error_probability = 0.04
```
For evaluation use [EASSE](https://github.com/feralvam/easse) package.

**Note**:  The scores in the table are very close to those in the paper, but not fully match them due to the 2 reasons:
- in the paper, we reported average scores of 4 models trained with different seeds;
- we merged codebases for GEC and Text Simplification tasks and updated them to the newer version of transformers lib.

## Noticeable works based on GECToR

- Vanilla PyTorch implementation of GECToR with AMP and distributed support by DeepSpeed [[code](https://github.com/cofe-ai/fast-gector)]
- Improving Sequence Tagging approach for Grammatical Error Correction task [[paper](https://s3.eu-central-1.amazonaws.com/ucu.edu.ua/wp-content/uploads/sites/8/2021/04/Improving-Sequence-Tagging-Approach-for-Grammatical-Error-Correction-Task-.pdf)][[code](https://github.com/MaksTarnavskyi/gector-large)]
- LM-Critic: Language Models for Unsupervised Grammatical Error Correction [[paper](https://arxiv.org/pdf/2109.06822.pdf)][[code](https://github.com/michiyasunaga/LM-Critic)]

## Citation
If you find this work is useful for your research, please cite our papers:

#### GECToR – Grammatical Error Correction: Tag, Not Rewrite
```
@inproceedings{omelianchuk-etal-2020-gector,
    title = "{GECT}o{R} {--} Grammatical Error Correction: Tag, Not Rewrite",
    author = "Omelianchuk, Kostiantyn  and
      Atrasevych, Vitaliy  and
      Chernodub, Artem  and
      Skurzhanskyi, Oleksandr",
    booktitle = "Proceedings of the Fifteenth Workshop on Innovative Use of NLP for Building Educational Applications",
    month = jul,
    year = "2020",
    address = "Seattle, WA, USA â†’ Online",
    publisher = "Association for Computational Linguistics",
    url = "https://www.aclweb.org/anthology/2020.bea-1.16",
    pages = "163--170",
    abstract = "In this paper, we present a simple and efficient GEC sequence tagger using a Transformer encoder. Our system is pre-trained on synthetic data and then fine-tuned in two stages: first on errorful corpora, and second on a combination of errorful and error-free parallel corpora. We design custom token-level transformations to map input tokens to target corrections. Our best single-model/ensemble GEC tagger achieves an F{\_}0.5 of 65.3/66.5 on CONLL-2014 (test) and F{\_}0.5 of 72.4/73.6 on BEA-2019 (test). Its inference speed is up to 10 times as fast as a Transformer-based seq2seq GEC system.",
}
```

#### Text Simplification by Tagging
```
@inproceedings{omelianchuk-etal-2021-text,
    title = "{T}ext {S}implification by {T}agging",
    author = "Omelianchuk, Kostiantyn  and
      Raheja, Vipul  and
      Skurzhanskyi, Oleksandr",
    booktitle = "Proceedings of the 16th Workshop on Innovative Use of NLP for Building Educational Applications",
    month = apr,
    year = "2021",
    address = "Online",
    publisher = "Association for Computational Linguistics",
    url = "https://aclanthology.org/2021.bea-1.2",
    pages = "11--25",
    abstract = "Edit-based approaches have recently shown promising results on multiple monolingual sequence transduction tasks. In contrast to conventional sequence-to-sequence (Seq2Seq) models, which learn to generate text from scratch as they are trained on parallel corpora, these methods have proven to be much more effective since they are able to learn to make fast and accurate transformations while leveraging powerful pre-trained language models. Inspired by these ideas, we present TST, a simple and efficient Text Simplification system based on sequence Tagging, leveraging pre-trained Transformer-based encoders. Our system makes simplistic data augmentations and tweaks in training and inference on a pre-existing system, which makes it less reliant on large amounts of parallel training data, provides more control over the outputs and enables faster inference speeds. Our best model achieves near state-of-the-art performance on benchmark test datasets for the task. Since it is fully non-autoregressive, it achieves faster inference speeds by over 11 times than the current state-of-the-art text simplification system.",
}
```
---

## 离线使用 `roberta-base`

    >>> from huggingface_hub import snapshot_download
    >>> snapshot_download(repo_id="roberta-base", local_dir="./models/roberta-base-local")



    $ git diff gector/tokenizer_indexer.py

            model_name = copy.deepcopy(pretrained_model)
            model_tokenizer = AutoTokenizer.from_pretrained(
    -            model_name, do_lower_case=do_lowercase, do_basic_tokenize=False, use_fast=True)
    +            'models/roberta-base-local',
    +            do_lower_case=do_lowercase, do_basic_tokenize=False, use_fast=True)

            # to adjust all tokenizers
            if hasattr(model_tokenizer, 'encoder'):

    TRANSFORMERS_OFFLINE=1 python app.py

## 测试 web api

    curl -s -X POST http://localhost:5000/api/actions   -H "Content-Type: application/json"   -d '{"sentence": "the list of item are on the table since yesterday."}'  | jq

## install

    mkdir -p models/roberta
    wget https://grammarly-nlp-data-public.s3.amazonaws.com/gector/roberta_1_gectorv2.th -O models/roberta/roberta_1_gectorv2.th

    curl https://pyenv.run | bash

    pyenv install 3.7.10
    pyenv virtualenv 3.7.10 gector
    pyenv activate gector

    pip install --upgrade pip setuptools wheel
    pip install jsonnet==0.17.0
    pip install -r requirements.txt --prefer-binary

## 文件介绍

gector 目录下每个文件的简单介绍如下：

1. **bert_token_embedder.py**
   主要用于将BERT模型的分词嵌入（token embedding）集成到GEC（语法纠错）模型中，实现将文本输入转化为BERT的向量表示。

2. **datareader.py**
   用于读取和处理训练、验证、测试所需的数据文件，负责数据的加载、预处理和批处理等功能。

3. **gec_model.py**
   实现GEC（Grammatical Error Correction）模型的核心结构和前向传播等逻辑，是整个纠错模型的主要实现文件。

4. **seq2labels_model.py**
   实现将序列（文本）映射为标签的模型结构，是一种将序列标注问题建模为多标签分类的方法，常用于GEC任务。

5. **tokenization.py**
   负责文本的分词（tokenization）操作，将输入的原始文本分割成词或子词，便于后续模型处理。

6. **tokenizer_indexer.py**
   为分词器生成词索引（token index），用于把分词后的token映射到对应的词表索引，通常用于输入嵌入层。

7. **trainer.py**
   主要负责模型的训练过程，包括训练逻辑、损失计算、优化器设置、评估与保存模型等功能。

如需了解某个文件的详细实现，可以指定文件名获取更深入的说明。

## helper 介绍

以下是 `utils/helpers.py` 文件中几个重要函数的作用介绍：

### 1. `get_verb_form_dicts()`
- **作用**: 加载动词形式的编码和解码字典。
- **功能**: 从 `verb-form-vocab.txt` 文件中读取数据，生成两个字典：
  - `encode`: 将动词形式映射到其标签。
  - `decode`: 根据标签解码得到目标动词形式。
- **用途**: 用于动词形式转换和预测。

---

### 2. `get_target_sent_by_edits(source_tokens, edits)`
- **作用**: 根据编辑操作生成目标句子。
- **功能**: 根据编辑列表对源句子进行处理，包括删除、添加、替换等操作。
- **用途**: 应用各种编辑操作以生成目标文本。

---

### 3. `apply_reverse_transformation(source_token, transform)`
- **作用**: 应用反向转换操作。
- **功能**:
  - 根据不同的转换类型（如大小写转换、动词形式转换、单复数转换等）处理单词。
  - 如果没有匹配的转换类型，会抛出异常。
- **用途**: 用于根据操作类型对单词进行反向转换。

---

### 4. `read_parallel_lines(fn1, fn2)`
- **作用**: 读取两个文件中的平行内容。
- **功能**: 从两个文件中读取对应行，过滤掉空行，并返回两个列表。
- **用途**: 用于处理平行文件内容，如训练数据中的源句子和目标句子。

---

### 5. `normalize(sent)`
- **作用**: 正规化句子。
- **功能**:
  - 移除重复的单词。
  - 替换句子中的特定字符或标记。
  - 将句子转换为小写。
- **用途**: 清洗文本数据以用于后续处理。

---

### 6. `get_weights_name(transformer_name, lowercase)`
- **作用**: 根据模型名称和大小写参数返回权重名称。
- **功能**: 返回预定义的 Transformer 模型权重名称，并给出警告提示（如模型训练时是否大小写敏感）。
- **用途**: 用于加载预训练模型权重。

---

### 7. `remove_double_tokens(sent)`
- **作用**: 移除句子中重复的相邻词。
- **功能**: 遍历句子中的单词，删除重复出现的相邻词。
- **用途**: 清理文本以提高质量。

---

如果你还有其他函数需要具体介绍，请告诉我！

Place your offline Transformer models here to avoid fetching weights from Hugging Face at runtime.

Recommended layout for the default embedder:

```
public/models/all-MiniLM-L6-v2/
  config.json
  model.onnx
  tokenizer.json
  vocab.txt
  ...
```

If you are using a different model, set `LOCAL_EMBEDDING_MODEL_PATH` to the folder containing its ONNX artifacts. When populated, `getEmbedder` will load from this directory with `localFilesOnly: true` to avoid network downloads and speed up cold starts.

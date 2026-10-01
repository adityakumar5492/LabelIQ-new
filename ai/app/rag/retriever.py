from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer


BASE_DIR = Path(__file__).resolve().parent

VECTOR_STORE_DIR = BASE_DIR / "vector_store"
COLLECTION_NAME = "ingredient_knowledge"

MAX_DISTANCE = 1.2


_model = None
_client = None
_collection = None


def get_model():
    global _model

    if _model is None:
        _model = SentenceTransformer(
            "all-MiniLM-L6-v2"
        )

    return _model


def get_collection():
    global _client
    global _collection

    if _collection is None:
        _client = chromadb.PersistentClient(
            path=str(VECTOR_STORE_DIR)
        )

        _collection = _client.get_collection(
            name=COLLECTION_NAME
        )

    return _collection


def exact_match(
    query: str,
    collection
):
    """
    Match the query against the ingredient name
    and all known aliases.
    """

    query_normalized = (
        query.strip().lower()
    )

    all_data = collection.get(
        include=[
            "documents",
            "metadatas"
        ]
    )

    documents = all_data.get(
        "documents",
        []
    )

    metadatas = all_data.get(
        "metadatas",
        []
    )

    for index, metadata in enumerate(
        metadatas
    ):

        ingredient = str(
            metadata.get(
                "ingredient",
                ""
            )
        ).strip().lower()

        aliases_text = str(
            metadata.get(
                "aliases",
                ""
            )
        )

        aliases = [
            alias.strip().lower()
            for alias in aliases_text.split(",")
            if alias.strip()
        ]

        # Exact ingredient match
        if query_normalized == ingredient:

            return {
                "document":
                    documents[index],
                "metadata":
                    metadata,
                "distance": 0,
                "match_type":
                    "exact"
            }

        # Exact alias match
        if query_normalized in aliases:

            return {
                "document":
                    documents[index],
                "metadata":
                    metadata,
                "distance": 0,
                "match_type":
                    "alias"
            }

    return None

def search_knowledge(
    query: str,
    top_k: int = 3
):

    query = query.strip()

    if not query:
        return []

    collection = get_collection()

    # ------------------------------------------------
    # 1. Exact ingredient match
    # ------------------------------------------------

    exact_result = exact_match(
        query,
        collection
    )

    if exact_result:

        return [
            exact_result
        ]

    # ------------------------------------------------
    # 2. Semantic vector search
    # ------------------------------------------------

    model = get_model()

    query_embedding = model.encode(
        [query],
        normalize_embeddings=True
    ).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k
    )

    documents = results.get(
        "documents",
        [[]]
    )[0]

    metadatas = results.get(
        "metadatas",
        [[]]
    )[0]

    distances = results.get(
        "distances",
        [[]]
    )[0]

    output = []

    for index, document in enumerate(
        documents
    ):

        distance = (
            distances[index]
            if index < len(distances)
            else None
        )

        if (
            distance is not None
            and distance > MAX_DISTANCE
        ):
            continue

        metadata = (
            metadatas[index]
            if index < len(metadatas)
            else {}
        )

        output.append({
            "document": document,
            "metadata": metadata,
            "distance": distance,
            "match_type": "semantic"
        })

    return output
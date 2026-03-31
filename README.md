# Refx Research Manager

## Overview

Refx Research Manager is a local-first research library and reading environment. It combines a modern interface with a native desktop experience to help you manage, explore, and understand collections of PDFs without relying on cloud services.

All your data stays on your machine: documents, database, notes, and search index. No sync, no accounts, no dependencies.

---

## Why Refx?

Most reference managers are:
- Cloud-dependent  
- Overcomplicated  
- Focused on storage, not understanding  

Refx is built differently:

- **Local-first**: your data is yours  
- **Research-oriented**: built to explore knowledge, not just store it  
- **Fast**: no server, no latency  
- **Extensible**: designed for advanced analysis (graph, OCR, metadata enrichment)

---

## Core Features

### 📚 Local Research Library

- Manage multiple libraries of PDFs
- Store documents with metadata (title, authors, year, DOI, tags)
- Track reading progress (last page, last opened)
- Fully offline, powered by a local SQLite database

---

### 📄 PDF Import & Reader

- Import PDFs via native file picker
- Files are copied and organized internally
- Built-in reader:
  - Opens local PDFs instantly
  - Remembers last page
  - Tracks reading sessions

---

### 🧠 Metadata Extraction & Enrichment

- Automatic metadata detection from PDFs
- Enrichment via:
  - Crossref
  - OpenAlex
  - Semantic Scholar
- BibTeX import support

This transforms raw PDFs into structured research entries.

---

### 🔍 Full-Text Search Engine

- Local indexing of all documents
- Search across:
  - Full text (including OCR)
  - Metadata (authors, DOI, tags)
- Supports:
  - AND / OR / NOT queries
  - Phrase search
  - Fuzzy matching

Results include:
- Ranked relevance
- Snippets
- Page-level matches

---

### 🔎 OCR (Scanned PDFs Support)

- Automatic OCR using Tesseract
- Extracts text from scanned documents
- Stores text with confidence scoring
- Fully integrated into search

---

### 🔗 Citation Detection & Linking

- Parses references inside documents
- Matches citations across your library using:
  - DOI matching
  - Title similarity
  - Author + year heuristics

Creates a connected research graph automatically.

---

### 🕸️ Research Graph Visualization

- Interactive graph of your documents
- Explore relationships between papers
- Visual modes:
  - By year
  - By citation density
  - By reading status
- Metrics:
  - Citation count
  - Connectivity
  - Graph clusters

---

### 🏷️ Tags, Keywords & Notes

- Add custom tags and keywords
- Attach notes to documents
- Structure your thinking alongside your reading

---

## Philosophy

Refx is not just a reference manager.

It is a **research exploration tool**.

Instead of just storing papers, it helps you:
- Understand connections
- Navigate knowledge
- Build your own research map

---

## Current Status

Refx is actively evolving.

Planned improvements include:
- Advanced PDF annotations (highlighting, geometry)
- Full note editing system
- Improved metadata extraction pipeline
- Deeper graph intelligence

---

## Who is it for?

- Researchers  
- Engineers  
- Students  
- Anyone working with large PDF collections  

Especially useful if you:
- Work offline or with sensitive data
- Read many papers
- Want to understand relationships between documents

---

## Summary

Refx transforms a folder of PDFs into a **structured, searchable, and connected research system**.

Your papers become:
- Indexed  
- Enriched  
- Linked  
- Explorable  

All locally.

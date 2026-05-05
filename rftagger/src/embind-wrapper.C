
/*******************************************************************/
/*                                                                 */
/*     File: embind-wrapper.C                                      */
/*   Author: Helmut Schmid (modified for Emscripten)               */
/*  Purpose: Emscripten Embind wrapper for RFTagger                */
/*  Created: Based on c-wrapper.C                                  */
/*                                                                 */
/*******************************************************************/

#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <cstring>
#include "POSTagger.h"

using namespace emscripten;

// Wrapper class for JavaScript-friendly interface
class RFTaggerJS {
private:
    POSTagger* tagger;
    
public:
    RFTaggerJS() : tagger(nullptr) {}
    
    ~RFTaggerJS() {
        if (tagger) {
            delete tagger;
        }
    }
    
    // Load model from virtual filesystem path
    bool loadModel(const std::string& modelPath, 
                   bool normalize = true,
                   double beamThreshold = 0.001,
                   bool sentStartHeuristic = false) {
        fprintf(stderr, "loadModel: starting...\n");
        
        if (tagger) {
            fprintf(stderr, "loadModel: deleting old tagger\n");
            delete tagger;
            tagger = nullptr;
        }
        
        fprintf(stderr, "loadModel: opening file %s\n", modelPath.c_str());
        FILE* file = fopen(modelPath.c_str(), "rb");
        if (!file) {
            fprintf(stderr, "loadModel: ERROR - cannot open file %s\n", modelPath.c_str());
            return false;
        }
        
        // Read first 16 bytes to debug
        unsigned char header[16];
        fread(header, 1, 16, file);
        fseek(file, 0, SEEK_SET);
        fprintf(stderr, "loadModel: First 16 bytes: ");
        for (int i = 0; i < 16; i++) fprintf(stderr, "%02X ", header[i]);
        fprintf(stderr, "\n");
        
        // Get file size
        fseek(file, 0, SEEK_END);
        long fileSize = ftell(file);
        fseek(file, 0, SEEK_SET);
        fprintf(stderr, "loadModel: file size = %ld bytes\n", fileSize);
        
        try {
            fprintf(stderr, "loadModel: creating POSTagger...\n");
            tagger = new POSTagger(file, normalize, beamThreshold, 
                                   sentStartHeuristic, false);
            fclose(file);
            
            fprintf(stderr, "loadModel: SUCCESS - tag count = %zu\n", tagger->tagmap.size());
            return true;
        } catch (const std::exception& e) {
            fprintf(stderr, "loadModel: ERROR - %s\n", e.what());
            fclose(file);
            return false;
        }
    }
    
    // Helper: core tagging logic that works on a vector of tokens
    std::vector<std::string> tagTokensImpl(const std::vector<std::string>& tokens) {
        std::vector<std::string> results;
        if (!tagger) {
            fprintf(stderr, "tagTokens: tagger not loaded\n");
            return results;
        }
        if (tokens.empty()) {
            fprintf(stderr, "tagTokens: empty token list\n");
            return results;
        }
        fprintf(stderr, "tagTokens: processing %zu tokens via file\n", tokens.size());
        
        // Write tokens to temp file (one per line, with final empty line)
        const char* tempFile = "/tmp/tag_input.txt";
        FILE* fp = fopen(tempFile, "w");
        if (!fp) {
            fprintf(stderr, "tagTokens: failed to create temp file\n");
            return results;
        }
        for (const auto& token : tokens) {
            fprintf(fp, "%s\n", token.c_str());
        }
        fprintf(fp, "\n");  // Empty line to mark sentence end
        fclose(fp);
        
        // Read back using file-based Sentence constructor (like rft-annotate)
        fp = fopen(tempFile, "r");
        if (!fp) {
            fprintf(stderr, "tagTokens: failed to open temp file for reading\n");
            return results;
        }
        Sentence sent(fp);
        fclose(fp);
        
        fprintf(stderr, "tagTokens: sentence loaded with %zu tokens\n", sent.token.size());
        
        // Annotate
        tagger->annotate(sent);
        
        // Extract results
        for (size_t i = 0; i < sent.token.size(); i++) {
            const char* tagName = tagger->tagmap.name(sent.token[i].tag);
            results.push_back(std::string(tagName));
        }
        
        fprintf(stderr, "tagTokens: done, returning %zu results\n", results.size());
        return results;
    }
    
    // Tag a vector of tokens (words) - JS-visible, accepts a JS array
    std::vector<std::string> tagTokens(emscripten::val tokens) {
        std::vector<std::string> tokenList;
        if (!tagger) {
            fprintf(stderr, "tagTokens: tagger not loaded\n");
            return std::vector<std::string>();
        }
        if (!tokens.isArray()) {
            fprintf(stderr, "tagTokens: expected an array argument\n");
            return std::vector<std::string>();
        }
        unsigned length = tokens["length"].as<unsigned>();
        tokenList.reserve(length);
        for (unsigned i = 0; i < length; i++) {
            tokenList.push_back(tokens[i].as<std::string>());
        }
        return tagTokensImpl(tokenList);
    }
    
    // Tag a single token
    std::string tagToken(const std::string& token) {
        std::vector<std::string> tokens = {token};
        std::vector<std::string> results = tagTokensImpl(tokens);
        if (!results.empty()) {
            return results[0];
        }
        return "";
    }
    
    // Check if model is loaded
    bool isLoaded() const {
        return tagger != nullptr;
    }
    
    // Get tag name from number
    std::string getTagName(int tagNum) {
        if (!tagger) return "";
        if (tagNum < 0 || (size_t)tagNum >= tagger->tagmap.size()) return "";
        return std::string(tagger->tagmap.name((SymNum)tagNum));
    }
    
    // Get number of tags in the model
    int getTagCount() {
        if (!tagger) return 0;
        return (int)tagger->tagmap.size();
    }
    
    // Helper: core batch tagging logic
    std::vector<std::vector<std::string>> tagSentencesImpl(
        const std::vector<std::vector<std::string>>& sentences) {
        
        std::vector<std::vector<std::string>> results;
        
        if (!tagger || sentences.empty()) {
            return results;
        }
        
        fprintf(stderr, "tagSentences: processing %zu sentences\n", sentences.size());
        
        // Process all sentences in one batch
        for (size_t s = 0; s < sentences.size(); s++) {
            const auto& words = sentences[s];
            
            if (words.empty()) {
                results.push_back(std::vector<std::string>());
                continue;
            }
            
            // Copy strings for this sentence
            std::vector<std::string> wordsCopy = words;
            std::vector<char*> wordPtrs;
            wordPtrs.reserve(wordsCopy.size());
            for (auto& word : wordsCopy) {
                wordPtrs.push_back(const_cast<char*>(word.c_str()));
            }
            
            // Create sentence and annotate (no resetState to avoid result corruption)
            Sentence sent(wordPtrs.data(), wordsCopy.size());
            tagger->annotate(sent);
            
            // Extract tags for this sentence
            std::vector<std::string> sentenceTags;
            for (size_t i = 0; i < sent.token.size(); i++) {
                const char* tagName = tagger->tagmap.name(sent.token[i].tag);
                sentenceTags.push_back(std::string(tagName));
            }
            results.push_back(sentenceTags);
        }
        
        fprintf(stderr, "tagSentences: done, processed %zu sentences\n", results.size());
        return results;
    }
    
    // Tag multiple sentences - JS-visible, accepts a JS array of arrays
    std::vector<std::vector<std::string>> tagSentences(emscripten::val sentences) {
        if (!tagger) {
            fprintf(stderr, "tagSentences: tagger not loaded\n");
            return std::vector<std::vector<std::string>>();
        }
        if (!sentences.isArray()) {
            fprintf(stderr, "tagSentences: expected an array argument\n");
            return std::vector<std::vector<std::string>>();
        }
        unsigned numSentences = sentences["length"].as<unsigned>();
        std::vector<std::vector<std::string>> sentVec;
        sentVec.reserve(numSentences);
        for (unsigned i = 0; i < numSentences; i++) {
            emscripten::val words = sentences[i];
            if (!words.isArray()) {
                fprintf(stderr, "tagSentences: sentence %u is not an array\n", i);
                sentVec.push_back(std::vector<std::string>());
                continue;
            }
            unsigned numWords = words["length"].as<unsigned>();
            std::vector<std::string> wordVec;
            wordVec.reserve(numWords);
            for (unsigned j = 0; j < numWords; j++) {
                wordVec.push_back(words[j].as<std::string>());
            }
            sentVec.push_back(wordVec);
        }
        return tagSentencesImpl(sentVec);
    }
};

// Embind bindings
EMSCRIPTEN_BINDINGS(rftagger) {
    // Register vector types first so Embind can convert JS arrays to std::vector
    register_vector<std::string>("StringVector");
    register_vector<std::vector<std::string>>("StringVectorVector");

    class_<RFTaggerJS>("RFTagger")
        .constructor()
        .function("loadModel", &RFTaggerJS::loadModel)
        .function("tagTokens", &RFTaggerJS::tagTokens)
        .function("tagToken", &RFTaggerJS::tagToken)
        .function("tagSentences", &RFTaggerJS::tagSentences)
        .function("isLoaded", &RFTaggerJS::isLoaded)
        .function("getTagName", &RFTaggerJS::getTagName)
        .function("getTagCount", &RFTaggerJS::getTagCount);
}

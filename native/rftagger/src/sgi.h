
/*******************************************************************/
/*                                                                 */
/*     File: sgi.h                                                 */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Sep 11 15:58:25 2008                              */
/* Modified: Thu Sep 11 15:59:23 2008 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef _SGI_INCLUDED
#define _SGI_INCLUDED

// Modern C++11+ compilers (Emscripten, recent GCC/Clang)
#if defined(SGI_MODERN) || defined(__EMSCRIPTEN__) || (__cplusplus >= 201103L && !defined(SGI__gnu_cxx))

#include <unordered_map>
#include <unordered_set>
#include <functional>
#include <string>

// Wrapper structs for backward compatibility
template<typename K, typename V, typename H = std::hash<K>, typename E = std::equal_to<K>>
struct hash_map : public std::unordered_map<K, V, H, E> {
    typedef std::unordered_map<K, V, H, E> base_type;
    typedef typename base_type::iterator iterator;
    typedef typename base_type::const_iterator const_iterator;
    hash_map() : base_type() {}
    hash_map(size_t n) : base_type(n) {}
};

template<typename K, typename H = std::hash<K>, typename E = std::equal_to<K>>
struct hash_set : public std::unordered_set<K, H, E> {
    typedef std::unordered_set<K, H, E> base_type;
    typedef typename base_type::iterator iterator;
    typedef typename base_type::const_iterator const_iterator;
    hash_set() : base_type() {}
    hash_set(size_t n) : base_type(n) {}
};

template<typename T>
struct hash : public std::hash<T> {};

// Specialization for const char* to hash string content, not pointer value
template<>
struct hash<const char*> {
    size_t operator()(const char* s) const {
        return std::hash<std::string>()(s ? s : "");
    }
};

#elif defined(SGI__gnu_cxx)

#include <ext/hash_map>
#include <ext/hash_set>
using __gnu_cxx::hash_map;
using __gnu_cxx::hash_set;
using __gnu_cxx::hash;

#else

#ifdef SGIext
#include <ext/hash_map>
#include <ext/hash_set>
#else
#include <backward/hash_map>
#include <backward/hash_set>
#endif

using std::hash_map;
using std::hash_set;
using std::hash;

#endif

#endif

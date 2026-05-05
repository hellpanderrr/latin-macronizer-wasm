
/*******************************************************************/
/*                                                                 */
/*     File: sgi-modern.h                                          */
/*   Author: Helmut Schmid (modified for modern C++)             */
/*  Purpose: Compatibility header for modern C++ compilers         */
/*  Created: 2024 - Modern C++ compatibility                       */
/*                                                                 */
/*******************************************************************/

#ifndef _SGI_INCLUDED
#define _SGI_INCLUDED

// Use modern C++11 unordered containers instead of deprecated __gnu_cxx::hash_map
#include <unordered_map>
#include <unordered_set>
#include <functional>

// Compatibility typedefs
#define hash_map std::unordered_map
#define hash_set std::unordered_set
#define hash std::hash

#endif

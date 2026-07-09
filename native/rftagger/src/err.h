
/*******************************************************************/
/*                                                                 */
/*     File: err.h                                                 */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Mon Nov 14 16:21:58 2011                              */
/* Modified: Mon Nov 14 16:22:23 2011 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef _ERR_H_
#define _ERR_H_

#include <stdlib.h>

#define warnx(...) do { \
        fprintf (stderr, __VA_ARGS__); \
        fprintf (stderr, "\n"); \
} while (0)

#define errx(code, ...) do { \
        fprintf (stderr, __VA_ARGS__); \
        fprintf (stderr, "\n"); \
        exit (code); \
} while (0)

#endif /* !_ERR_H_ */

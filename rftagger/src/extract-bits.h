
/*******************************************************************/
/*                                                                 */
/*     File: extract-bits.h                                        */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jul 12 17:15:18 2007                              */
/* Modified: Mon Jan 12 15:01:19 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

// extraction of the 1 bits from the bit vector
size_t f = 0;
for( size_t i=0; i<size; i++, f+=INT_BITS ) {
  unsigned int n = vec[i];
  if (n) {
    if (n & 0x0000ffff) {
      if (n & 0x000000ff) {
	if (n & 0x0000000f) {
	  if (n & 0x00000003) {
	    if (n & 0x00000001) {
	      m.push_back((Feature)(f));
	    }
	    if (n & 0x00000002) {
	      m.push_back((Feature)(f + 1));
	    }
	  }
	  if (n & 0x0000000c) {
	    if (n & 0x00000004) {
	      m.push_back((Feature)(f + 2));
	    }
	    if (n & 0x00000008) {
	      m.push_back((Feature)(f + 3));
	    }
	  }
	}
	if (n & 0x000000f0) {
	  if (n & 0x00000030) {
	    if (n & 0x00000010) {
	      m.push_back((Feature)(f + 4));
	    }
	    if (n & 0x00000020) {
	      m.push_back((Feature)(f + 5));
	    }
	  }
	  if (n & 0x000000c0) {
	    if (n & 0x00000040) {
	      m.push_back((Feature)(f + 6));
	    }
	    if (n & 0x00000080) {
	      m.push_back((Feature)(f + 7));
	    }
	  }
	}
      }
      if (n & 0x0000ff00) {
	if (n & 0x00000f00) {
	  if (n & 0x00000300) {
	    if (n & 0x00000100) {
	      m.push_back((Feature)(f + 8));
	    }
	    if (n & 0x00000200) {
	      m.push_back((Feature)(f + 9));
	    }
	  }
	  if (n & 0x00000c00) {
	    if (n & 0x00000400) {
	      m.push_back((Feature)(f + 10));
	    }
	    if (n & 0x00000800) {
	      m.push_back((Feature)(f + 11));
	    }
	  }
	}
	if (n & 0x0000f000) {
	  if (n & 0x00003000) {
	    if (n & 0x00001000) {
	      m.push_back((Feature)(f + 12));
	    }
	    if (n & 0x00002000) {
	      m.push_back((Feature)(f + 13));
	    }
	  }
	  if (n & 0x0000c000) {
	    if (n & 0x00004000) {
	      m.push_back((Feature)(f + 14));
	    }
	    if (n & 0x00008000) {
	      m.push_back((Feature)(f + 15));
	    }
	  }
	}
      }
    }
    if (n & 0xffff0000) {
      if (n & 0x00ff0000) {
	if (n & 0x000f0000) {
	  if (n & 0x00030000) {
	    if (n & 0x00010000) {
	      m.push_back((Feature)(f + 16));
	    }
	    if (n & 0x00020000) {
	      m.push_back((Feature)(f + 17));
	    }
	  }
	  if (n & 0x000c0000) {
	    if (n & 0x00040000) {
	      m.push_back((Feature)(f + 18));
	    }
	    if (n & 0x00080000) {
	      m.push_back((Feature)(f + 19));
	    }
	  }
	}
	if (n & 0x00f00000) {
	  if (n & 0x00300000) {
	    if (n & 0x00100000) {
	      m.push_back((Feature)(f + 20));
	    }
	    if (n & 0x00200000) {
	      m.push_back((Feature)(f + 21));
	    }
	  }
	  if (n & 0x00c00000) {
	    if (n & 0x00400000) {
	      m.push_back((Feature)(f + 22));
	    }
	    if (n & 0x00800000) {
	      m.push_back((Feature)(f + 23));
	    }
	  }
	}
      }
      if (n & 0xff000000) {
	if (n & 0x0f000000) {
	  if (n & 0x03000000) {
	    if (n & 0x01000000) {
	      m.push_back((Feature)(f + 24));
	    }
	    if (n & 0x02000000) {
	      m.push_back((Feature)(f + 25));
	    }
	  }
	  if (n & 0x0c000000) {
	    if (n & 0x04000000) {
	      m.push_back((Feature)(f + 26));
	    }
	    if (n & 0x08000000) {
	      m.push_back((Feature)(f + 27));
	    }
	  }
	}
	if (n & 0xf0000000) {
	  if (n & 0x30000000) {
	    if (n & 0x10000000) {
	      m.push_back((Feature)(f + 28));
	    }
	    if (n & 0x20000000) {
	      m.push_back((Feature)(f + 29));
	    }
	  }
	  if (n & 0xc0000000) {
	    if (n & 0x40000000) {
	      m.push_back((Feature)(f + 30));
	    }
	    if (n & 0x80000000) {
	      m.push_back((Feature)(f + 31));
	    }
	  }
	}
      }
    }
  }
 }

/*******************************************************************/
/*      File: Prob.h                                               */
/*    Author: Helmut Schmid                                        */
/*   Purpose: Logarithmic representation of probabilities to avoid */
/*            underflow problems                                   */
/*   Created: Tue Oct 29 10:01:36 2002                             */
/*  Modified: Wed Sep  7 13:19:10 2016 (schmid)                    */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*******************************************************************/

#ifndef PROB_H
#define PROB_H

#include <stdio.h>
#include <float.h>
#include <math.h>
#include <assert.h>

#define LOG_ZERO (-DBL_MAX)
#define MaxLogDiff 45.0


class Prob {

  double _logprob;

public:
  inline Prob( const double p ) {
    assert(p >= 0.0);
    if (p == 0.0)
      _logprob = LOG_ZERO;
    else if (p == 1.0)
      _logprob = 0.0;
    else
      _logprob = log(p);
  }
  inline Prob( const Prob &p ) {
    _logprob = p._logprob;
  }
  inline Prob() {
    _logprob = LOG_ZERO;
  }
  inline Prob operator+(const Prob x) const;
  inline Prob operator-(const Prob x) const;
  inline Prob operator*(const Prob x) const;
  inline Prob operator*(const double x) const;
  inline Prob operator/(const Prob x) const;
  inline Prob operator+=(const Prob x);
  inline Prob operator-=(const Prob x);
  inline Prob operator*=(const Prob x);
  inline Prob operator*=(const double x);
  inline Prob operator/=(const Prob x);
  inline Prob operator/=(const double x);
  inline int  operator==(const Prob x) const;
  inline int  operator>(const Prob x) const;
  inline int  operator>=(const Prob x) const;
  inline int  operator<(const Prob x) const;
  inline int  operator<=(const Prob x) const;
  inline int  operator>(double p) const;
  inline int  operator>=(double p) const;
  inline int  operator<(double p) const;
  inline int  operator<=(double p) const;
  double logprob() const { return _logprob; };
  operator double() const { 
    return exp(_logprob);
  }
};


inline Prob Prob::operator*(const Prob x) const
{
  Prob result; // constructor setzt result auf 0

  if (_logprob != LOG_ZERO && x._logprob != LOG_ZERO)
    result._logprob = _logprob + x._logprob;
  return result;
}

inline Prob Prob::operator*(const double x) const
{
  Prob result; // constructor setzt result auf 0

  if (_logprob != LOG_ZERO && x != 0.0)
    result._logprob = _logprob + log(x);
  return result;
}

inline Prob Prob::operator/(const Prob x) const
{
  Prob result;

  if (_logprob == LOG_ZERO)
    result._logprob = LOG_ZERO;
  else if (x._logprob == LOG_ZERO) {
    assert(0);
    fprintf(stderr,"Prob: division by zero error!\n");
    throw("division by zero");
  }
  else
    result._logprob = _logprob - x._logprob;
  return result;
}

inline Prob Prob::operator+(const Prob x) const
{
  double base;
  Prob result;

  if (_logprob == LOG_ZERO)
    result._logprob = x._logprob;
  else if (x._logprob == LOG_ZERO)
    result._logprob = _logprob;
  else if (_logprob < x._logprob - MaxLogDiff)
    result = x;
  else if (x._logprob < _logprob - MaxLogDiff)
    result = *this;
  else {
    base = (_logprob < x._logprob) ? _logprob : x._logprob;
    result._logprob = base + log(exp(_logprob-base) + exp(x._logprob-base));
  }
  return result;
}

inline Prob Prob::operator-(const Prob x) const
{
  double base;
  Prob result;

  if (x._logprob == LOG_ZERO)
    result._logprob = _logprob;
  else if (_logprob < x._logprob) {
    assert(0);
    throw("negative result of Prob subtraction");
  }
  else if (_logprob - MaxLogDiff > x._logprob)
    result = *this;
  else {
    base = (_logprob < x._logprob) ? _logprob : x._logprob;
    result._logprob = base + log(exp(_logprob-base) - exp(x._logprob-base));
  }
  return result;
}

inline Prob Prob::operator+=(const Prob x)
{
  return (*this = *this + x);
}

inline Prob Prob::operator-=(const Prob x)
{
  return (*this = *this - x);
}

inline Prob Prob::operator*=(const Prob x)
{
  if (_logprob == LOG_ZERO)
    ;
  else if (x._logprob == LOG_ZERO)
    _logprob = LOG_ZERO;
  else
    _logprob += x._logprob;
  return *this;
}

inline Prob Prob::operator*=(const double x)
{
  if (_logprob == LOG_ZERO)
    ;
  else if (x == 0.0)
    _logprob = LOG_ZERO;
  else
    _logprob += log(x);
  return *this;
}

inline Prob Prob::operator/=(const Prob x)
{
  if (x._logprob == LOG_ZERO) {
    assert(0);
    throw("division by zero");
  }
  else if (_logprob == LOG_ZERO)
    ;
  else
    _logprob = _logprob - x._logprob;
  return *this;
}

inline Prob Prob::operator/=(const double x)
{
  if (x == 0.0) {
    assert(0);
    throw("division by zero");
  }
  else if (_logprob == LOG_ZERO)
    ;
  else
    _logprob -= log(x);
  return *this;
}

inline int Prob::operator==(Prob x) const
{
  return (_logprob == x._logprob);
}

inline int Prob::operator>(Prob x) const
{
  return (_logprob > x._logprob);
}

inline int Prob::operator>=(Prob x) const
{
  return (_logprob >= x._logprob);
}

inline int Prob::operator<(Prob x) const
{
  return (_logprob < x._logprob);
}

inline int Prob::operator<=(Prob x) const
{
  return (_logprob <= x._logprob);
}


inline int Prob::operator>(double p) const
{
  if (p == 0.0)
    return _logprob > LOG_ZERO;
  return (_logprob > log(p));
}

inline int Prob::operator>=(double p) const
{
  if (p == 0.0)
    return true;
  return (_logprob >= log(p));
}

inline int Prob::operator<(double p) const
{
  if (p == 0.0)
    return false;
  return (_logprob < log(p));
}

inline int Prob::operator<=(double p) const
{
  if (p == 0.0)
    return _logprob == LOG_ZERO;
  return (_logprob <= log(p));
}


inline Prob operator+(const double f, const Prob x)
{
  return (Prob)f + x;
}

inline Prob operator*(const double f, const Prob x)
{
  return (Prob)f * x;
}

inline Prob operator/(const double f, const Prob x)
{
  return (Prob)f / x;
}

inline Prob operator==(const double f, const Prob x)
{
  return ((Prob)f == x);
}

inline Prob operator>(const double f, const Prob x)
{
  return ((Prob)f > x);
}

inline Prob operator<(const double f, const Prob x)
{
  return ((Prob)f < x);
}


inline double log(const Prob x)
{
  return x.logprob();
}

#endif //PROB_H

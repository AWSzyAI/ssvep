#!/usr/bin/env perl
use strict;
use warnings;
use IO::Socket::INET;
use Cwd qw(getcwd);

my $port = shift @ARGV;
$port = 8000 unless defined $port;

my $root = getcwd();
my $server = IO::Socket::INET->new(
  LocalPort => $port,
  Type => SOCK_STREAM,
  Reuse => 1,
  Listen => 10
) or die "Unable to bind to port $port: $!\n";

print "Serving $root on http://localhost:$port\n";

while (my $client = $server->accept()) {
  $client->autoflush(1);

  my $request_line = <$client>;
  if (!defined $request_line) {
    close $client;
    next;
  }

  my ($method, $path) = $request_line =~ m{^(\S+)\s+(\S+)};

  while (my $line = <$client>) {
    last if $line =~ /^\s*$/;
  }

  if (!$method || ($method ne 'GET' && $method ne 'HEAD')) {
    print $client "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n";
    close $client;
    next;
  }

  $path =~ s/\?.*$//;
  $path =~ s/%20/ /g;
  $path =~ s/^\///;
  $path = 'index.html' if $path eq '';

  if ($path =~ /\.\./) {
    print $client "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n";
    close $client;
    next;
  }

  my $full = "$root/$path";
  if (-d $full) {
    $full = "$full/index.html";
  }

  if (!-f $full) {
    print $client "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nNot Found\n";
    close $client;
    next;
  }

  open(my $fh, '<', $full) or do {
    print $client "HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n";
    close $client;
    next;
  };
  binmode($fh);

  my $size = -s $full;
  my $ctype = content_type($full);

  print $client "HTTP/1.1 200 OK\r\n";
  print $client "Content-Type: $ctype\r\n";
  print $client "Content-Length: $size\r\n";
  print $client "Cache-Control: no-cache\r\n";
  print $client "Connection: close\r\n\r\n";

  if ($method eq 'GET') {
    my $buffer;
    while (read($fh, $buffer, 8192)) {
      print $client $buffer;
    }
  }

  close($fh);
  close($client);
}

sub content_type {
  my ($path) = @_;
  return 'text/html; charset=utf-8' if $path =~ /\.html?$/i;
  return 'text/css; charset=utf-8' if $path =~ /\.css$/i;
  return 'application/javascript; charset=utf-8' if $path =~ /\.js$/i;
  return 'application/json; charset=utf-8' if $path =~ /\.json$/i;
  return 'image/svg+xml' if $path =~ /\.svg$/i;
  return 'image/png' if $path =~ /\.png$/i;
  return 'image/jpeg' if $path =~ /\.jpe?g$/i;
  return 'text/plain; charset=utf-8' if $path =~ /\.txt$/i;
  return 'application/octet-stream';
}

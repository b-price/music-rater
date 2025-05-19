import React, { useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Card, Spinner } from 'react-bootstrap';

interface Artist {
    id: string;
    name: string;
    genres?: { name: string }[];
}

interface Rating {
    rating: number;
    title: string;
    artist?: Artist;
    isAlbum: boolean;
}

interface RatingData {
    [id: string]: Rating;
}

interface GraphData {
    nodes: {
        id: string;
        name: string;
        val: number;
        color: string;
    }[];
    links: {
        source: string;
        target: string;
        value: number;
    }[];
}

interface ForceGraphVisualizationProps {
    ratings: RatingData;
}

const ForceGraphVisualization: React.FC<ForceGraphVisualizationProps> = ({ ratings }) => {
    const graphData = useMemo(() => {
        // Extract artists from ratings
        const artistsMap = new Map<string, {
            artist: Artist;
            totalRating: number;
            ratingCount: number;
            genres: Set<string>;
        }>();

        // Process ratings to collect artist data
        Object.values(ratings).forEach(rating => {
            if (rating.artist) {
                const artistId = rating.artist.id;

                if (!artistsMap.has(artistId)) {
                    artistsMap.set(artistId, {
                        artist: rating.artist,
                        totalRating: 0,
                        ratingCount: 0,
                        genres: new Set(rating.artist.genres?.map(g => g.name) || [])
                    });
                }

                const artistData = artistsMap.get(artistId)!;
                artistData.totalRating += rating.rating;
                artistData.ratingCount += 1;
            }
        });

        // Create nodes
        const nodes = Array.from(artistsMap.entries()).map(([id, data]) => {
            const avgRating = data.ratingCount > 0 ? data.totalRating / data.ratingCount : 0;

            // Color from red (rating 1) to green (rating 10)
            const normalizedRating = avgRating / 10;
            const r = Math.floor(255 * (1 - normalizedRating));
            const g = Math.floor(255 * normalizedRating);
            const color = `rgb(${r}, ${g}, 0)`;

            return {
                id,
                name: data.artist.name,
                val: avgRating, // Size based on rating
                color
            };
        });

        // Create links between artists of the same genre
        const links: { source: string; target: string; value: number }[] = [];

        const artistIds = Array.from(artistsMap.keys());

        for (let i = 0; i < artistIds.length; i++) {
            const artistId1 = artistIds[i];
            const artist1 = artistsMap.get(artistId1)!;

            for (let j = i + 1; j < artistIds.length; j++) {
                const artistId2 = artistIds[j];
                const artist2 = artistsMap.get(artistId2)!;

                // Check if they share any genres
                const sharedGenres = Array.from(artist1.genres).filter(genre =>
                    artist2.genres.has(genre)
                );

                if (sharedGenres.length > 0) {
                    links.push({
                        source: artistId1,
                        target: artistId2,
                        value: sharedGenres.length // Strength based on number of shared genres
                    });
                }
            }
        }

        return { nodes, links } as GraphData;
    }, [ratings]);

    if (graphData.nodes.length === 0) {
        return (
            <Card className="my-4 p-4 text-center">
                <Card.Body>
                    <Card.Title>Artist Network Visualization</Card.Title>
                    <p>No artist connections to display. Rate more artists with genres to see connections.</p>
                </Card.Body>
            </Card>
        );
    }

    return (
        <Card className="my-4">
            <Card.Body>
                <Card.Title>Artist Network Visualization</Card.Title>
                <p className="text-muted">
                    Artists are connected if they share genres. Color indicates average rating (red = low, green = high).
                    Node size represents rating value.
                </p>
                <div style={{ height: '600px', width: '100%' }}>
                    <ForceGraph2D
                        graphData={graphData}
                        nodeLabel={node => `${node.name} (Rating: ${node.val.toFixed(1)})`}
                        nodeColor={node => node.color}
                        nodeRelSize={6}
                        linkWidth={link => link.value}
                        cooldownTicks={100}
                        onEngineStop={() => console.log('Graph rendering complete')}
                    />
                </div>
            </Card.Body>
        </Card>
    );
};

export default ForceGraphVisualization;
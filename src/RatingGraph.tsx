import React, { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { RatingData } from './App';

interface RatingGraphProps {
    ratings: RatingData;
}

const RatingGraph: React.FC<RatingGraphProps> = ({ ratings }) => {
    // Process ratings data into nodes and links
    const graphData = useMemo(() => {
        const nodes: { id: string; name: string; avgRating: number; genre?: string }[] = [];
        const links: { source: string; target: string }[] = [];
        const artistRatings: { [artistId: string]: { ratings: number[]; genres: Set<string> } } = {};

        // Aggregate ratings by artist
        Object.values(ratings).forEach(rating => {
            if (rating.artist?.id) {
                if (!artistRatings[rating.artist.id]) {
                    artistRatings[rating.artist.id] = {
                        ratings: [],
                        genres: new Set(rating.artist.genres?.map(g => g.name))
                    };
                }
                artistRatings[rating.artist.id].ratings.push(rating.rating);
            }
        });

        // Create nodes for artists with ratings
        Object.entries(artistRatings).forEach(([artistId, data]) => {
            const avgRating = data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length;
            nodes.push({
                id: artistId,
                name: ratings[Object.keys(ratings).find(k => ratings[k].artist?.id === artistId)!].artist!.name,
                avgRating,
                genre: Array.from(data.genres)[0] // Use first genre for simplicity
            });
        });

        // Create links between artists of same genre
        nodes.forEach((nodeA, i) => {
            nodes.slice(i + 1).forEach(nodeB => {
                if (nodeA.genre && nodeB.genre === nodeA.genre) {
                    links.push({ source: nodeA.id, target: nodeB.id });
                }
            });
        });

        return { nodes, links };
    }, [ratings]);

    // Color scale from red (0) to green (10)
    const getColor = (rating: number) => {
        const r = Math.floor(255 * (1 - rating / 10));
        const g = Math.floor(255 * (rating / 10));
        return `rgb(${r}, ${g}, 0)`;
    };

    return (
        <div className="mb-4">
            <ForceGraph2D
                graphData={graphData}
                nodeLabel="name"
                nodeAutoColorBy={null}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const size = 12 / globalScale;
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI, false);
                    ctx.fillStyle = getColor(node.avgRating);
                    ctx.fill();

                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'black';
                    ctx.fillText(label, node.x!, node.y! + size + fontSize);
                }}
                nodeCanvasObjectMode={() => 'replace'}
                linkColor={() => 'rgba(0,0,0,0.2)'}
                width={800}
                height={600}
            />
        </div>
    );
};

export default RatingGraph;